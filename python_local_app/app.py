from __future__ import annotations

from pathlib import Path
import customtkinter as ctk
from tkinter import filedialog, messagebox

from excel_service import process_mtr_excel, ExcelProcessingError

ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")


class MtrLocalApp(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        self.title("MTR Local - CustomTkinter")
        self.geometry("820x520")

        self.selected_file: Path | None = None

        self.header = ctk.CTkLabel(
            self,
            text="MTR Local (sem hospedagem)",
            font=ctk.CTkFont(size=24, weight="bold"),
        )
        self.header.pack(pady=(20, 10))

        self.subtitle = ctk.CTkLabel(
            self,
            text="Importe um Excel e processe os MTRs localmente",
        )
        self.subtitle.pack(pady=(0, 20))

        self.actions = ctk.CTkFrame(self)
        self.actions.pack(fill="x", padx=20, pady=10)

        self.btn_select = ctk.CTkButton(self.actions, text="Selecionar Excel", command=self.select_file)
        self.btn_select.pack(side="left", padx=10, pady=10)

        self.btn_process = ctk.CTkButton(self.actions, text="Processar", command=self.process_file)
        self.btn_process.pack(side="left", padx=10, pady=10)

        self.file_label = ctk.CTkLabel(self, text="Nenhum arquivo selecionado")
        self.file_label.pack(padx=20, pady=(5, 15), anchor="w")

        self.output = ctk.CTkTextbox(self)
        self.output.pack(fill="both", expand=True, padx=20, pady=(0, 20))
        self.output.insert("end", "Aguardando importação...\n")

    def log(self, message: str) -> None:
        self.output.insert("end", f"{message}\n")
        self.output.see("end")

    def select_file(self) -> None:
        file_path = filedialog.askopenfilename(
            title="Selecione a planilha de MTR",
            filetypes=[("Excel", "*.xlsx *.xls")],
        )
        if not file_path:
            return

        self.selected_file = Path(file_path)
        self.file_label.configure(text=f"Arquivo: {self.selected_file}")
        self.log(f"Arquivo selecionado: {self.selected_file.name}")

    def process_file(self) -> None:
        if not self.selected_file:
            messagebox.showwarning("Aviso", "Selecione um arquivo primeiro.")
            return

        try:
            summary = process_mtr_excel(self.selected_file)
            self.log("--- Resultado do processamento local ---")
            self.log(f"Linhas totais: {summary.total_rows}")
            self.log(f"Linhas com status SALVO: {summary.saved_rows}")
            self.log(f"MTRs únicos identificados: {summary.unique_mtrs}")
            self.log(f"Linhas SALVO sem Nº MTR: {summary.missing_mtr_code_rows}")
        except ExcelProcessingError as exc:
            messagebox.showerror("Erro", str(exc))
            self.log(f"Erro: {exc}")
        except Exception as exc:
            messagebox.showerror("Erro inesperado", str(exc))
            self.log(f"Erro inesperado: {exc}")


if __name__ == "__main__":
    app = MtrLocalApp()
    app.mainloop()
