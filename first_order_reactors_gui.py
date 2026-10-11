#!/usr/bin/env python3
"""
First-order reaction: reactors in series GUI
-------------------------------------------
Inputs:
  x = CA/CA0 (the graph's x-axis, between 0 and 1)
  y = tau_N/tau_P (the graph's y-axis, >= 1)
  N = number of equal-sized CSTRs in series (positive integer)

For a first-order reaction in N equal CSTRs in series:
  x = (1 + k*tau_N/N)**(-N)
  k*tau_N = N*(x**(-1/N) - 1)
  k*tau_P = -ln(x)
  y_predicted = tau_N/tau_P

Conversion is X_A = 1 - CA/CA0 = 1 - x.
The entered y value is compared with the value predicted by x and N.
"""

import tkinter as tk
from tkinter import ttk, messagebox
import math

import numpy as np
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg


def ratio_for_x_n(x, n):
    """Return tau_N/tau_P for first-order reaction at outlet ratio x."""
    if not (0.0 < x < 1.0):
        raise ValueError("CA/CA0 (x) must be greater than 0 and less than 1.")
    if n < 1:
        raise ValueError("Number of reactors N must be at least 1.")
    k_tau_n = n * (x ** (-1.0 / n) - 1.0)
    k_tau_p = -math.log(x)
    return k_tau_n / k_tau_p


class ReactorGraphApp:
    def __init__(self, root):
        self.root = root
        self.root.title("First-Order Reaction — Reactors in Series")
        self.root.geometry("1100x760")
        self.root.minsize(900, 650)

        main = ttk.Frame(root, padding=12)
        main.pack(fill=tk.BOTH, expand=True)

        title = ttk.Label(
            main,
            text="First-Order Reaction: Reactors in Series",
            font=("Arial", 16, "bold")
        )
        title.pack(anchor="w", pady=(0, 8))

        desc = ttk.Label(
            main,
            text="Enter graph coordinates x = CA/CA0 and y = τN/τP, plus the number N of equal CSTRs in series."
        )
        desc.pack(anchor="w", pady=(0, 10))

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
        ttk.Button(buttons, text="Calculate / Update Graph", command=self.calculate).pack(fill=tk.X)
        ttk.Button(buttons, text="Reset", command=self.reset).pack(fill=tk.X, pady=(5, 0))

        self.result_var = tk.StringVar(value="Enter values and click Calculate / Update Graph.")
        result_box = ttk.LabelFrame(main, text="Results", padding=10)
        result_box.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(
            result_box, textvariable=self.result_var, justify=tk.LEFT,
            font=("Arial", 10)
        ).pack(anchor="w")

        graph_frame = ttk.Frame(main)
        graph_frame.pack(fill=tk.BOTH, expand=True)

        self.fig = Figure(figsize=(8.5, 5.2), dpi=100)
        self.ax = self.fig.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.fig, master=graph_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

        self.draw_base_graph()
        self.calculate()

    def draw_base_graph(self, marker=None):
        self.ax.clear()
        # Avoid x=0 and x=1 endpoints where the logarithmic ratio formula is undefined.
        x_values = np.geomspace(0.01, 0.999, 500)
        ns = [1, 2, 3, 4, 6, 10, 50]
        for n in ns:
            y_values = []
            for x in x_values:
                y_values.append(ratio_for_x_n(float(x), n))
            self.ax.plot(x_values, y_values, label=f"N = {n}", linewidth=1.8)

        # Constant k*tau contour lines (Levenspiel dashed contours)
        ktau_list = [(50, "kτ = 50"), (20, "20"), (10, "10"), (5, "5"), (2, "2"), (1, "kτ = 1")]
        for ktau, label in ktau_list:
            x_k = np.geomspace(0.01, 0.99, 200)
            y_k = ktau / (-np.log(x_k))
            valid = (y_k >= 1.0) & (y_k <= 30.0)
            if np.any(valid):
                self.ax.plot(x_k[valid], y_k[valid], color="gray", linestyle="--", linewidth=1.0, alpha=0.7)
                x_lbl = max(0.012, min(0.85, 1.0 / (ktau + 1.0)))
                y_lbl = ktau / (-math.log(x_lbl))
                if 1.0 <= y_lbl <= 28.0:
                    self.ax.text(x_lbl, y_lbl, f" {label}", fontsize=7.5, color="dimgray", rotation=-20, va="bottom")

        # The infinite-CSTR limit is a PFR; the ratio tends to 1.
        self.ax.axhline(1.0, color="black", linestyle="-", linewidth=1.5, label="N → ∞ (plug flow)")
        self.ax.set_xscale("log")
        self.ax.set_yscale("log")
        self.ax.set_xlim(0.01, 1.0)
        self.ax.set_ylim(0.95, 30)
        self.ax.set_xlabel(r"$1 - X_A = C_A/C_{A0}$")
        self.ax.set_ylabel(r"$\tau_N/\tau_P = (C_{A0}V/F_{A0})_N / (C_{A0}V/F_{A0})_{plug}$")
        self.ax.set_title("First-order reaction — Reactors in Series")
        self.ax.grid(True, which="both", linestyle=":", alpha=0.65)
        self.ax.legend(loc="upper right", ncol=2, fontsize=8)
        if marker is not None:
            x, y, n = marker
            self.ax.scatter([x], [y], s=75, marker="o", zorder=5,
                            label="Entered point")
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
            if not math.isfinite(x) or not 0 < x < 1:
                raise ValueError("x = CA/CA0 must be between 0 and 1 (not including endpoints).")
            if not math.isfinite(y_entered) or y_entered < 1:
                raise ValueError("y = τN/τP must be 1 or greater.")
            if not n_float.is_integer() or n_float < 1:
                raise ValueError("N must be a positive whole number.")
            n = int(n_float)

            conversion = 1.0 - x
            predicted = ratio_for_x_n(x, n)
            error_pct = abs(y_entered - predicted) / predicted * 100.0
            k_tau_n = n * (x ** (-1.0 / n) - 1.0)
            k_tau_p = -math.log(x)

            if error_pct <= 5:
                consistency = "The entered x, y, and N are reasonably consistent (within 5%)."
            else:
                consistency = (
                    "The entered y does not closely match the first-order model for this x and N. "
                    "Conversion is still calculated from x."
                )

            self.result_var.set(
                f"Conversion achieved: X_A = 1 − x = {conversion:.6f} = {conversion*100:.3f}%\n"
                f"Reactant remaining: CA/CA₀ = {x:.6g}\n"
                f"Entered y = τN/τP: {y_entered:.6g}\n"
                f"Model-predicted τN/τP for x and N={n}: {predicted:.6g}\n"
                f"Difference from predicted ratio: {error_pct:.3f}%\n"
                f"Dimensionless space-times: kτN = {k_tau_n:.6g}; kτP = {k_tau_p:.6g}\n"
                f"{consistency}"
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
    ReactorGraphApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
