"""Machine-learning modelling attacks on delay-based PUFs.

The additive delay model makes the response of a k-stage Arbiter PUF a linear
threshold function of the parity feature vector ``phi(c)``.  A logistic
regression trained on a few hundred challenge-response pairs (CRPs) therefore
predicts unseen responses with high accuracy (Rührmair et al., CCS 2010).

This module provides:

* :func:`logistic_regression` -- a ridge-regularised Newton/IRLS solver
  (deterministic, no external ML dependency);
* :func:`modeling_attack` -- learning curve on user supplied CRPs;
* :func:`simulated_attack` -- learning curve on a freshly simulated
  (k-XOR) Arbiter PUF, reproducible through the portable RNG.

A PUF whose prediction accuracy stays near 50 % for large training sets is
resistant to *this* attack; it is not a proof of security against stronger
learners (e.g. multi-layer perceptrons, CMA-ES, reliability-based attacks).
"""

import numpy as np

from .rng import PortableRNG
from .simulators import arbiter_features

__all__ = ["logistic_regression", "modeling_attack", "simulated_attack"]


def _sigmoid(z):
    return 0.5 * (1.0 + np.tanh(0.5 * z))


def logistic_regression(X, y, l2=1e-2, max_iter=30, tol=1e-6):
    """Fit ridge-regularised logistic regression with Newton's method.

    Returns the weight vector.
    """
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    d = X.shape[1]
    w = np.zeros(d)
    eye = np.eye(d)
    for _ in range(max_iter):
        p = _sigmoid(X @ w)
        g = X.T @ (p - y) + l2 * w
        s = p * (1.0 - p)
        H = (X * s[:, None]).T @ X + l2 * eye
        step = np.linalg.solve(H, g)
        w -= step
        if np.max(np.abs(step)) < tol:
            break
    return w


def _curve(phi, y, train_sizes, test_size, l2):
    n = phi.shape[0]
    test_size = min(test_size, n // 2)
    Xte, yte = phi[n - test_size:], y[n - test_size:]
    pool = n - test_size
    sizes, train_acc, test_acc = [], [], []
    for m in train_sizes:
        m = int(min(m, pool))
        if m < 2 or (sizes and m == sizes[-1]):
            continue
        w = logistic_regression(phi[:m], y[:m], l2=l2)
        train_acc.append(float(np.mean((phi[:m] @ w > 0) == (y[:m] > 0.5))))
        test_acc.append(float(np.mean((Xte @ w > 0) == (yte > 0.5))))
        sizes.append(m)
    return {"train_sizes": sizes, "train_accuracy": train_acc, "test_accuracy": test_acc,
            "test_size": int(test_size)}


def modeling_attack(challenges, responses, train_sizes=(50, 100, 200, 500, 1000, 2000), test_size=1000,
                    l2=1e-2):
    """Learning curve of a logistic-regression attack on supplied CRPs.

    Parameters
    ----------
    challenges : array (n_crps, stages) of 0/1
    responses : array (n_crps,) of 0/1
        The last ``test_size`` CRPs form the held-out test set.
    """
    phi = arbiter_features(challenges)
    y = np.asarray(responses, dtype=float).ravel()
    if phi.shape[0] != y.size:
        raise ValueError("challenges and responses must have the same length")
    return _curve(phi, y, train_sizes, test_size, l2)


def simulated_attack(stages=64, xor=1, noise=0.05, train_sizes=(50, 100, 200, 500, 1000, 2000, 5000),
                     test_size=2000, seed=7, l2=1e-2):
    """Learning curve of the attack against a simulated (k-XOR) Arbiter PUF.

    Random-number order (mirrored in the web app): chain weights
    ``xor*(stages+1)`` normals, then ``N*stages`` challenge bits, then
    ``N*xor`` noise normals, where ``N = max(train_sizes) + test_size``.
    """
    rng = PortableRNG(seed)
    k, x = int(stages), int(xor)
    n = int(max(train_sizes)) + int(test_size)
    weights = np.array(rng.normals(x * (k + 1))).reshape(x, k + 1)
    ch = np.array(rng.bits(n * k), dtype=np.uint8).reshape(n, k)
    phi = arbiter_features(ch)
    z = np.array(rng.normals(n * x)).reshape(n, x)
    delay = phi @ weights.T + noise * z
    y = np.bitwise_xor.reduce((delay > 0).astype(np.uint8), axis=1).astype(float)
    res = _curve(phi, y, train_sizes, test_size, l2)
    res.update({"stages": k, "xor": x, "noise": float(noise), "seed": int(seed)})
    return res
