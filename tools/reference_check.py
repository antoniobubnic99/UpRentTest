"""
Independent reference implementation (Python) used to cross-check the TypeScript solver.

Written separately from the app, with a different structure (top-down DP per subset +
brute-force over the 2^5 possible splits, since only N01-N05 fit truck A).
Run:  python3 tools/reference_check.py
Expected: 182.2 km without time limit, 200.1 km with the 9 h (drive + handling) limit,
217.0 km with the 9 h limit and a mandatory 30 min break for every truck with orders.
"""
import math
from functools import lru_cache

LOC = {0: (0, 0), 1: (3, 8), 2: (10, 11), 3: (17, 9), 4: (9, -6), 5: (26, 3),
       6: (-7, 13), 7: (20, -8), 8: (23, 15), 9: (-8, -5)}
WEIGHT = [800, 1300, 1800, 2400, 3100, 3900, 4800, 6100, 7500, 9400]
ORDERS = [(1, 3), (2, 5), (9, 4), (3, 0), (0, 8), (5, 7), (8, 2), (4, 9), (6, 1), (7, 3)]
TRUCK_A = (3500, 2)
TRUCK_B = (10000, 3)
SPEED, HANDLING_H, MAX_H = 60, 20 / 60, 9


def d(a, b):
    return round(math.dist(LOC[a], LOC[b]), 1)


def best_route(orders, cap, max_items):
    """Shortest route serving `orders` (tuple of order indexes), returns (km, actions)."""
    @lru_cache(None)
    def f(loc, state):
        if all(s == 2 for s in state):
            return d(loc, 0), ()
        load = sum(WEIGHT[orders[i]] for i, s in enumerate(state) if s == 1)
        cnt = sum(1 for s in state if s == 1)
        best = (math.inf, ())
        for i, s in enumerate(state):
            o = orders[i]
            if s == 0 and load + WEIGHT[o] <= cap and cnt + 1 <= max_items:
                nxt = ORDERS[o][0]
            elif s == 1:
                nxt = ORDERS[o][1]
            else:
                continue
            ns = state[:i] + (s + 1,) + state[i + 1:]
            km, acts = f(nxt, ns)
            km += d(loc, nxt)
            if km < best[0]:
                best = (km, (("P" if s == 0 else "D") + f"{o + 1:02d}@L{nxt}",) + acts)
        return best

    return f(0, tuple([0] * len(orders)))


def hours(km, n_orders, break_h=0.0):
    return km / SPEED + 2 * n_orders * HANDLING_H + (break_h if n_orders else 0.0)


def solve(time_limit, break_h=0.0):
    best = None
    for mask in range(32):  # only N01..N05 fit truck A
        a = tuple(i for i in range(5) if mask >> i & 1)
        b = tuple(i for i in range(10) if i not in a)
        ka, ra = best_route(a, *TRUCK_A)
        kb, rb = best_route(b, *TRUCK_B)
        if time_limit and (hours(ka, len(a), break_h) > MAX_H or hours(kb, len(b), break_h) > MAX_H):
            continue
        total = round(ka + kb, 1)
        if best is None or total < best[0]:
            best = (total, a, round(ka, 1), ra, b, round(kb, 1), rb)
    return best


if __name__ == "__main__":
    for label, limit, brk in [
        ("bez limita", False, 0.0),
        ("limit 9 h (voznja + utovar/istovar)", True, 0.0),
        ("limit 9 h + pauza 30 min", True, 0.5),
    ]:
        total, a, ka, ra, b, kb, rb = solve(limit, brk)
        print(f"== {label}: {total} km")
        print(f"   A {[f'N{i + 1:02d}' for i in a]} {ka} km, {hours(ka, len(a), brk):.2f} h: {' '.join(ra)}")
        print(f"   B {[f'N{i + 1:02d}' for i in b]} {kb} km, {hours(kb, len(b), brk):.2f} h: {' '.join(rb)}")
