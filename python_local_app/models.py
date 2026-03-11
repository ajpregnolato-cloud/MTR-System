from dataclasses import dataclass


@dataclass(frozen=True)
class ImportSummary:
    total_rows: int
    saved_rows: int
    unique_mtrs: int
    missing_mtr_code_rows: int
