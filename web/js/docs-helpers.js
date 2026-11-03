import { BIBTEX } from './report.js';
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const BIB = BIBTEX.replace(/</g, '&lt;');
