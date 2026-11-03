"""The :class:`PUFDataset` container and data import / export helpers.

A PUF evaluation data set is naturally three-dimensional::

    devices  x  measurements (repeated read-outs)  x  response bits

``PUFDataset`` stores exactly that, while allowing a different number of
measurements per device and an optional *condition* label for every
measurement (e.g. ``"25C/1.20V"``) so that reliability can be broken down by
operating corner.  Measurement 0 of every device is the *enrolment* read-out.
"""

import csv
import io
import json
import re

import numpy as np

__all__ = ["PUFDataset", "parse_response", "parse_text"]

_BIN_RE = re.compile(r"^[01]+$")
_HEX_RE = re.compile(r"^(0x)?[0-9a-fA-F]+$")
_HEADER_ALIASES = {
    "device": ("device", "device_id", "puf", "puf_id", "chip", "instance", "id"),
    "measurement": ("measurement", "sample", "repeat", "repetition", "readout", "trial", "index"),
    "condition": ("condition", "env", "environment", "corner", "temperature", "temp", "voltage"),
    "response": ("response", "bits", "value", "data", "hex", "bitstring"),
}


def parse_response(token, fmt="auto"):
    """Convert a textual response into a ``uint8`` bit vector.

    Parameters
    ----------
    token : str
        Binary (``"0110..."``) or hexadecimal (``"0x3fa..."`` / ``"3fa..."``)
        representation.  Spaces and underscores are ignored.
    fmt : {"auto", "bin", "hex"}
        ``auto`` treats a token consisting only of 0/1 characters as binary
        unless it carries a ``0x`` prefix.
    """
    t = str(token).strip().replace(" ", "").replace("_", "")
    if fmt == "bin" or (fmt == "auto" and _BIN_RE.match(t) and not t.lower().startswith("0x")):
        if not _BIN_RE.match(t):
            raise ValueError("Invalid binary response: %r" % token)
        return np.frombuffer(t.encode("ascii"), dtype=np.uint8) - ord("0")
    if not _HEX_RE.match(t):
        raise ValueError("Invalid response token: %r" % token)
    if t.lower().startswith("0x"):
        t = t[2:]
    bits = "".join(format(int(c, 16), "04b") for c in t)
    return np.frombuffer(bits.encode("ascii"), dtype=np.uint8) - ord("0")


def _split(line):
    for sep in (",", ";", "\t"):
        if sep in line:
            return [c.strip() for c in line.split(sep)]
    return line.split()


def _match_header(cells):
    mapping = {}
    for idx, cell in enumerate(cells):
        key = cell.strip().lower()
        for field, aliases in _HEADER_ALIASES.items():
            if key in aliases and field not in mapping:
                mapping[field] = idx
    return mapping if "response" in mapping else None


def parse_text(text, fmt="auto"):
    """Parse a textual data set.

    Supported layouts (comma, semicolon, tab or whitespace separated):

    * one response per line            -> each line is a separate device
    * ``device,response``
    * ``device,measurement,response``
    * ``device,measurement,condition,response``
    * any of the above with a header row naming the columns
      (``device``, ``measurement``, ``condition``, ``response``)
    * a line of whitespace-separated single bits (``0 1 1 0 ...``)

    Lines starting with ``#`` are comments.  Returns a :class:`PUFDataset`.
    """
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln and not ln.startswith("#")]
    if not lines:
        raise ValueError("No data found")

    header = _match_header(_split(lines[0]))
    if header is not None:
        lines = lines[1:]

    records = []  # (device, measurement, condition, bits)
    for row, line in enumerate(lines):
        cells = [c for c in _split(line) if c != ""]
        if header is not None:
            dev = cells[header["device"]] if "device" in header else str(row)
            meas = cells[header["measurement"]] if "measurement" in header else None
            cond = cells[header["condition"]] if "condition" in header else None
            resp = cells[header["response"]]
        elif len(cells) > 4 and all(c in ("0", "1") for c in cells):
            dev, meas, cond, resp = str(row), None, None, "".join(cells)
        elif len(cells) == 1:
            dev, meas, cond, resp = str(row), None, None, cells[0]
        elif len(cells) == 2:
            dev, meas, cond, resp = cells[0], None, None, cells[1]
        elif len(cells) == 3:
            dev, meas, cond, resp = cells[0], cells[1], None, cells[2]
        elif len(cells) == 4:
            dev, meas, cond, resp = cells
        else:
            raise ValueError("Cannot interpret line %d: %r" % (row + 1, line))
        records.append((dev, meas, cond, resp))

    # auto format: binary only when *every* token is binary
    if fmt == "auto":
        all_bin = all(_BIN_RE.match(r[3].replace(" ", "").replace("_", "")) for r in records)
        fmt = "bin" if all_bin else "hex"

    order = []
    grouped = {}
    for dev, meas, cond, resp in records:
        if dev not in grouped:
            grouped[dev] = []
            order.append(dev)
        grouped[dev].append((meas, cond, parse_response(resp, fmt)))

    responses, conditions = [], []
    for dev in order:
        items = grouped[dev]
        if all(m is not None for m, _, _ in items):
            def _key(item):
                try:
                    return (0, float(item[0]))
                except ValueError:
                    return (1, item[0])
            items = sorted(items, key=_key)
        responses.append([bits for _, _, bits in items])
        conditions.append([c if c is not None else "nominal" for _, c, _ in items])
    return PUFDataset(responses, device_ids=order, conditions=conditions)


class PUFDataset:
    """Container for PUF response measurements.

    Parameters
    ----------
    responses :
        * ``ndarray`` of shape ``(devices, measurements, bits)``;
        * ``ndarray`` of shape ``(devices, bits)`` (one read-out per device);
        * list (devices) of lists (measurements) of bit strings / arrays; or
        * list of bit strings (one read-out per device).
    device_ids : list of str, optional
    conditions : list (devices) of list (measurements) of str, optional
        Operating-condition label of every measurement.
    challenges : array (bits, stages), optional
        Challenge applied to obtain every response bit (needed for modelling
        attacks on delay-based PUFs).
    name : str, optional
    metadata : dict, optional
        Free-form provenance information (simulator parameters, seed, ...).
    """

    def __init__(self, responses, device_ids=None, conditions=None, challenges=None, name=None, metadata=None):
        devices = []
        if isinstance(responses, np.ndarray):
            arr = np.asarray(responses)
            if arr.ndim == 2:
                arr = arr[:, None, :]
            if arr.ndim != 3:
                raise ValueError("Array input must have shape (devices, bits) or (devices, measurements, bits)")
            devices = [np.ascontiguousarray(arr[d], dtype=np.uint8) for d in range(arr.shape[0])]
        else:
            for dev in responses:
                if isinstance(dev, (str, bytes)):
                    dev = [dev]
                elif isinstance(dev, np.ndarray) and dev.ndim == 1:
                    dev = [dev]
                rows = []
                for m in dev:
                    if isinstance(m, (str, bytes)):
                        m = parse_response(m.decode() if isinstance(m, bytes) else m, "bin")
                    rows.append(np.asarray(m, dtype=np.uint8))
                devices.append(np.vstack(rows) if rows else np.zeros((0, 0), np.uint8))

        if not devices:
            raise ValueError("At least one device is required")
        n_bits = devices[0].shape[1]
        for i, d in enumerate(devices):
            if d.shape[0] == 0:
                raise ValueError("Device %d has no measurements" % i)
            if d.shape[1] != n_bits:
                raise ValueError("All responses must have the same length (device %d has %d bits, expected %d)" % (i, d.shape[1], n_bits))
            if d.size and d.max() > 1:
                raise ValueError("Responses must contain only 0/1 values")
        if n_bits == 0:
            raise ValueError("Responses must contain at least one bit")

        self.devices = devices
        self.device_ids = list(device_ids) if device_ids is not None else ["D%d" % i for i in range(len(devices))]
        if len(self.device_ids) != len(devices):
            raise ValueError("device_ids length does not match number of devices")
        if conditions is None:
            conditions = [["nominal"] * d.shape[0] for d in devices]
        self.conditions = [list(c) for c in conditions]
        for d, c in zip(devices, self.conditions):
            if len(c) != d.shape[0]:
                raise ValueError("conditions must provide one label per measurement")
        self.challenges = None if challenges is None else np.asarray(challenges, dtype=np.uint8)
        self.name = name or "dataset"
        self.metadata = dict(metadata or {})

    # ----------------------------------------------------------------- shape
    @property
    def n_devices(self):
        return len(self.devices)

    @property
    def n_bits(self):
        return self.devices[0].shape[1]

    @property
    def n_measurements(self):
        return [d.shape[0] for d in self.devices]

    @property
    def has_repeats(self):
        return any(d.shape[0] > 1 for d in self.devices)

    @property
    def condition_labels(self):
        seen = []
        for c in self.conditions:
            for x in c:
                if x not in seen:
                    seen.append(x)
        return seen

    def __len__(self):
        return self.n_devices

    def __repr__(self):
        return "PUFDataset(name=%r, devices=%d, measurements=%d..%d, bits=%d)" % (
            self.name,
            self.n_devices,
            min(self.n_measurements),
            max(self.n_measurements),
            self.n_bits,
        )

    # ------------------------------------------------------------ references
    def reference(self, method="first"):
        """Enrolled reference response of every device, shape (devices, bits).

        ``method="first"`` uses measurement 0 (the enrolment read-out);
        ``method="majority"`` uses the bitwise majority vote over all
        measurements (ties resolve to 1), i.e. the *golden* response.
        """
        if method == "first":
            return np.vstack([d[0] for d in self.devices])
        if method == "majority":
            return np.vstack([(2 * d.sum(axis=0) >= d.shape[0]).astype(np.uint8) for d in self.devices])
        raise ValueError("method must be 'first' or 'majority'")

    def to_array(self):
        """Return a ``(devices, measurements, bits)`` array (rectangular data only)."""
        m = set(self.n_measurements)
        if len(m) != 1:
            raise ValueError("Devices have a different number of measurements")
        return np.stack(self.devices)

    def subset(self, devices=None, bits=None):
        """Return a new data set restricted to the given device / bit indices."""
        dev_idx = list(range(self.n_devices)) if devices is None else list(devices)
        bit_idx = slice(None) if bits is None else np.asarray(bits)
        return PUFDataset(
            [self.devices[i][:, bit_idx] for i in dev_idx],
            device_ids=[self.device_ids[i] for i in dev_idx],
            conditions=[self.conditions[i] for i in dev_idx],
            challenges=None if self.challenges is None or bits is None else self.challenges[bit_idx],
            name=self.name,
            metadata=self.metadata,
        )

    # -------------------------------------------------------------------- IO
    @classmethod
    def from_bitstrings(cls, responses, **kw):
        """One response string per device."""
        return cls([[r] for r in responses], **kw)

    @classmethod
    def from_text(cls, text, fmt="auto", name=None):
        ds = parse_text(text, fmt)
        if name:
            ds.name = name
        return ds

    @classmethod
    def from_file(cls, path, fmt="auto"):
        """Load a ``.csv``/``.txt`` (see :func:`parse_text`), ``.npy`` or ``.json`` file."""
        path = str(path)
        if path.endswith(".npy"):
            return cls(np.load(path), name=path)
        if path.endswith(".json"):
            with open(path) as fh:
                obj = json.load(fh)
            return cls.from_dict(obj)
        with open(path) as fh:
            return cls.from_text(fh.read(), fmt=fmt, name=path)

    def to_csv(self, path=None, fmt="bin"):
        """Write the long ``device,measurement,condition,response`` format."""
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(["device", "measurement", "condition", "response"])
        for dev_id, dev, cond in zip(self.device_ids, self.devices, self.conditions):
            for m, (row, c) in enumerate(zip(dev, cond)):
                bits = "".join(map(str, row.tolist()))
                if fmt == "hex":
                    pad = (-len(bits)) % 4
                    bits = "0x%0*x" % ((len(bits) + pad) // 4, int(bits + "0" * pad, 2))
                w.writerow([dev_id, m, c, bits])
        text = buf.getvalue()
        if path is not None:
            with open(path, "w") as fh:
                fh.write(text)
        return text

    def to_dict(self):
        return {
            "name": self.name,
            "device_ids": self.device_ids,
            "conditions": self.conditions,
            "responses": [["".join(map(str, r.tolist())) for r in d] for d in self.devices],
            "challenges": None if self.challenges is None else ["".join(map(str, c.tolist())) for c in self.challenges],
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, obj):
        ch = obj.get("challenges")
        if ch is not None:
            ch = np.vstack([parse_response(c, "bin") for c in ch])
        return cls(
            obj["responses"],
            device_ids=obj.get("device_ids"),
            conditions=obj.get("conditions"),
            challenges=ch,
            name=obj.get("name"),
            metadata=obj.get("metadata"),
        )
