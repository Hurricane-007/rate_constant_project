#!/usr/bin/env python3
"""
Second-order reaction: reactors in series GUI
------------------------------------------------
Model: -r_A = k C_A^2, constant-density/constant-volume-flow assumptions.

Inputs:
  x = C_A/C_A0 = 1 - X_A, between 0 and 1
  y = (tau_N / tau_P), the entered graph y-coordinate
  N = number of equal-sized CSTRs in series

For a second-order reaction:
  k*C_A0*tau_P = (1/x) - 1

For N equal CSTRs in series, solve for the dimensionless residence time
beta = k*C_A0*tau_stage such that the N-stage outlet concentration is x.
Then k*C_A0*tau_N = N*beta and y_predicted = tau_N/tau_P.

Conversion achieved: X_A = 1 - x.
"""

import tkinter as tk
from tkinter import ttk, messagebox
import math

import numpy as np
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg


def outlet_after_n_cstrs(beta, n):
    """Dimensionless outlet concentration after N equal CSTRs in series."""
    c = 1.0
    for _ in range(n):
        # From c_in = c_out + beta*c_out**2.
        # This form avoids cancellation in the quadratic formula.
        c = 2.0 * c / (1.0 + math.sqrt(1.0 + 4.0 * beta * c))
    return c


def dimensionless_tau_n(x, n):
    """Return k*C_A0*tau_N needed to reach outlet ratio x."""
    if not (0.0 < x < 1.0):
        raise ValueError("x = CA/CA0 must be greater than 0 and less than 1.")
    if n < 1:
        raise ValueError("N must be at least 1.")

    # Find beta = k*C_A0*tau_stage by bisection.
    lo, hi = 0.0, 1.0
    while outlet_after_n_cstrs(hi, n) > x:
        hi *= 2.0
        if hi > 1e16:
            raise ValueError("Could not find a solution for this x and N.")
    for _ in range(100):
        mid = (lo + hi) / 2.0
        # Higher beta means lower outlet concentration.
        if outlet_after_n_cstrs(mid, n) > x:
            lo = mid
        else:
            hi = mid
    beta = (lo + hi) / 2.0
    return n * beta


def ratio_for_x_n(x, n):
    """Return tau_N/tau_P for a second-order reaction."""
    tau_n_star = dimensionless_tau_n(x, n)
    tau_p_star = (1.0 / x) - 1.0
    return tau_n_star / tau_p_star


class SecondOrderReactorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Second-Order Reaction — Reactors in Series")
        self.root.geometry("1120x780")
        self.root.minsize(900, 650)

        main = ttk.Frame(root, padding=12)
        main.pack(fill=tk.BOTH, expand=True)

        ttk.Label(
            main,
            text="Second-Order Reaction: Reactors in Series",
            font=("Arial", 16, "bold")
        ).pack(anchor="w", pady=(0, 6))

        ttk.Label(
            main,
            text="For −rA = kCA², enter x = CA/CA₀, y = τN/τP, and the number N of equal CSTRs in series."
        ).pack(anchor="w", pady=(0, 10))

        controls = ttk.Frame(main)
        controls.pack(fill=tk.X, pady=(0, 10))

        self.x_var = tk.StringVar(value="0.10")
        self.y_var = tk.StringVar(value="2.0")
        self.n_var = tk.StringVar(value="3")

        fields = [
            ("x-axis: CA/CA₀ (0 < x < 1)", self.x_var),
            ("y-axis: τN/τP (≥ 1)", self.y_var),
            ("Number of CSTRs, N", self.n_var),
        ]
        for col, (label, var) in enumerate(fields):
            frame = ttk.Frame(controls)
            frame.grid(row=0, column=col, sticky="ew", padx=(0, 12))
            ttk.Label(frame, text=label).pack(anchor="w")
            ttk.Entry(frame, textvariable=var, width=18).pack(anchor="w", pady=(3, 0))
            controls.columnconfigure(col, weight=1)

        buttons = ttk.Frame(controls)
        buttons.grid(row=0, column=3, sticky="n", padx=(4, 0))
        ttk.Button(
            buttons, text="Calculate / Update Graph", command=self.calculate
        ).pack(fill=tk.X)
        ttk.Button(buttons, text="Reset", command=self.reset).pack(fill=tk.X, pady=(5, 0))

        result_box = ttk.LabelFrame(main, text="Results", padding=10)
        result_box.pack(fill=tk.X, pady=(0, 10))
        self.result_var = tk.StringVar(value="Enter values and click Calculate / Update Graph.")
        ttk.Label(
            result_box, textvariable=self.result_var, justify=tk.LEFT,
            font=("Arial", 10), wraplength=1030
        ).pack(anchor="w")

        graph_frame = ttk.Frame(main)
        graph_frame.pack(fill=tk.BOTH, expand=True)

        self.fig = Figure(figsize=(9, 5.4), dpi=100)
        self.ax = self.fig.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.fig, master=graph_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

        self.draw_base_graph()
        self.calculate()

    def draw_base_graph(self, marker=None):
        self.ax.clear()
        x_values = np.geomspace(0.01, 0.999, 220)
        ns = [1, 2, 3, 4, 6, 10]
        for n in ns:
            ys = [ratio_for_x_n(float(x), n) for x in x_values]
            self.ax.plot(x_values, ys, linewidth=1.8, label=f"N = {n}")

        # Constant k*CA0*tau contour lines (Levenspiel dashed contours)
        k_ca0_list = [
            (1000, "kCA0τ = 1000"), (500, "500"), (200, "200"), (100, "100"),
            (50, "50"), (20, "20"), (10, "10"), (5, "5"), (2, "2"), (1, "1")
        ]
        for c, label in k_ca0_list:
            x_k = np.geomspace(0.01, 0.99, 200)
            y_k = (c * x_k) / (1.0 - x_k)
            valid = (y_k >= 1.0) & (y_k <= 100.0)
            if np.any(valid):
                self.ax.plot(x_k[valid], y_k[valid], color="gray", linestyle="--", linewidth=1.0, alpha=0.7)
                # Intersection with N=1 line: c*x^2 + x - 1 = 0
                x_int = (-1.0 + math.sqrt(1.0 + 4.0 * c)) / (2.0 * c)
                x_lbl = max(0.012, min(0.85, x_int))
                y_lbl = (c * x_lbl) / (1.0 - x_lbl)
                if 1.0 <= y_lbl <= 95.0:
                    self.ax.text(x_lbl, y_lbl, f" {label}", fontsize=7.5, color="dimgray", rotation=-25, va="bottom")

        # As N tends to infinity, a series of CSTRs approaches plug flow.
        self.ax.axhline(1.0, color="black", linestyle="-", linewidth=1.5, label="N → ∞ (plug flow)")
        self.ax.set_xscale("log")
        self.ax.set_yscale("log")
        self.ax.set_xlim(0.01, 1.0)
        self.ax.set_ylim(0.95, 100)
        self.ax.set_xlabel(r"$1 - X_A = C_A/C_{A0}$")
        self.ax.set_ylabel(r"$(\tau C_{A0})_N / (\tau C_{A0})_P = (C_{A0}^2 V/F_{A0})_N / (C_{A0}^2 V/F_{A0})_{plug}$")
        self.ax.set_title("Second-order reaction — Reactors in Series")
        self.ax.grid(True, which="both", linestyle=":", alpha=0.65)
        self.ax.legend(loc="upper right", ncol=2, fontsize=8)

        if marker is not None:
            x, y, n = marker
            self.ax.scatter([x], [y], s=75, marker="o", zorder=5, label="Input point")
            self.ax.annotate(
                f"Input point\nx={x:.4g}, y={y:.4g}, N={n}",
                (x, y), xytext=(10, 10), textcoords="offset points",
                fontsize=8, bbox=dict(boxstyle="round,pad=0.3", fc="white", alpha=0.85)
            )
        self.fig.tight_layout()
        self.canvas.draw()

    def calculate(self):
        try:
            x = float(self.x_var.get().strip())
            y_entered = float(self.y_var.get().strip())
            n_float = float(self.n_var.get().strip())

            if not math.isfinite(x) or not 0.0 < x < 1.0:
                raise ValueError("x = CA/CA0 must be greater than 0 and less than 1.")
            if not math.isfinite(y_entered) or y_entered < 1.0:
                raise ValueError("y = τN/τP must be 1 or greater.")
            if not math.isfinite(n_float) or not n_float.is_integer() or n_float < 1:
                raise ValueError("N must be a positive whole number.")
            n = int(n_float)

            conversion = 1.0 - x
            predicted = ratio_for_x_n(x, n)
            tau_n_star = dimensionless_tau_n(x, n)
            tau_p_star = (1.0 / x) - 1.0
            error_pct = abs(y_entered - predicted) / predicted * 100.0

            if error_pct <= 5:
                consistency = "The entered x, y, and N are reasonably consistent (within 5%)."
            else:
                consistency = (
                    "The entered y differs from the theoretical curve for this x and N. "
                    "Conversion is calculated directly from x."
                )

            self.result_var.set(
                f"Conversion achieved: XA = 1 − x = {conversion:.6f} = {conversion*100:.3f}%\n"
                f"Reactant remaining: CA/CA₀ = {x:.6g}\n"
                f"Entered y = τN/τP: {y_entered:.6g}\n"
                f"Model-predicted τN/τP for second-order kinetics and N={n}: {predicted:.6g}\n"
                f"Difference from predicted ratio: {error_pct:.3f}%\n"
                f"Dimensionless space-times: k·CA₀·τN = {tau_n_star:.6g}; "
                f"k·CA₀·τP = {tau_p_star:.6g}\n{consistency}"
            )
            self.draw_base_graph((x, y_entered, n))
        except ValueError as exc:
            messagebox.showerror("Check your inputs", str(exc))

    def reset(self):
        self.x_var.set("0.10")
        self.y_var.set("2.0")
        self.n_var.set("3")
        self.calculate()


def main():
    root = tk.Tk()
    try:
        ttk.Style().theme_use("clam")
    except tk.TclError:
        pass
    SecondOrderReactorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
