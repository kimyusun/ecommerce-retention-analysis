from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
PORTFOLIO_DIR = ROOT / "portfolio"
DATA_DIR = PORTFOLIO_DIR / "data"
SOURCE_CSV = ROOT / "data" / "raw" / "ecommerce_data.csv"


def pct(value: float) -> float:
    return round(value * 100, 2)


def records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", force_ascii=False))


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(
        SOURCE_CSV,
        dtype={
            "InvoiceNo": "string",
            "StockCode": "string",
            "Description": "string",
            "CustomerID": "float64",
            "Country": "string",
        },
    )
    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"])
    df["line_revenue"] = df["Quantity"] * df["UnitPrice"]

    masks: list[tuple[str, str, pd.Series]] = []
    current = pd.Series(True, index=df.index)

    masks.append(("raw", "원본 거래 라인", current.copy()))
    current = current & ~df["InvoiceNo"].str.startswith("C", na=False)
    masks.append(("remove_cancel_invoice", "InvoiceNo가 C로 시작하는 취소 거래 제거", current.copy()))
    current = current & (df["StockCode"].str.len() >= 5)
    masks.append(("remove_short_stock_code", "StockCode 5자 미만 특수 처리 코드 제거", current.copy()))
    current = current & (df["Quantity"] > 0)
    masks.append(("remove_non_positive_quantity", "Quantity 0 이하 제거", current.copy()))
    current = current & (df["UnitPrice"] > 0)
    masks.append(("remove_non_positive_unit_price", "UnitPrice 0 이하 제거", current.copy()))
    current = current & ~df["Quantity"].isin([80995, 74215])
    masks.append(("remove_quantity_outliers", "대량 이상치 Quantity 80995, 74215 제거", current.copy()))

    quality_rows = []
    previous_count = None
    for step, description, mask in masks:
        count = int(mask.sum())
        removed = 0 if previous_count is None else previous_count - count
        quality_rows.append(
            {
                "step": step,
                "description": description,
                "rows_remaining": count,
                "rows_removed_from_previous": int(removed),
                "rows_remaining_pct": pct(count / len(df)),
            }
        )
        previous_count = count

    clean = df[current].copy()
    clean["customer_key"] = clean["CustomerID"].apply(
        lambda value: "Guest" if pd.isna(value) else str(int(value))
    )
    clean["order_date"] = clean["InvoiceDate"].dt.date
    clean["order_month"] = clean["InvoiceDate"].dt.to_period("M").astype(str)

    date_calendar = pd.DataFrame(
        {"order_date": pd.date_range("2010-12-01", "2011-12-09", freq="D").date}
    )
    daily = (
        clean.groupby("order_date")
        .agg(
            daily_revenue=("line_revenue", "sum"),
            daily_customers=("customer_key", pd.Series.nunique),
            daily_orders=("InvoiceNo", pd.Series.nunique),
        )
        .reset_index()
    )
    daily_full = date_calendar.merge(daily, on="order_date", how="left").fillna(
        {"daily_revenue": 0, "daily_customers": 0, "daily_orders": 0}
    )
    daily_full["order_month"] = pd.to_datetime(daily_full["order_date"]).dt.to_period("M").astype(str)
    monthly_kpi = (
        daily_full.groupby("order_month")
        .agg(
            avg_daily_revenue=("daily_revenue", "mean"),
            avg_daily_customers=("daily_customers", "mean"),
            avg_daily_orders=("daily_orders", "mean"),
        )
        .round(2)
        .reset_index()
    )
    monthly_kpi["revenue_mom_pct"] = monthly_kpi["avg_daily_revenue"].pct_change().mul(100).round(2)
    monthly_kpi["customers_mom_pct"] = monthly_kpi["avg_daily_customers"].pct_change().mul(100).round(2)
    monthly_kpi["orders_mom_pct"] = monthly_kpi["avg_daily_orders"].pct_change().mul(100).round(2)

    member_clean = clean[clean["CustomerID"].notna()].copy()
    member_clean["customer_id"] = member_clean["CustomerID"].astype(int).astype(str)
    first_orders = (
        member_clean.groupby("customer_id")
        .agg(first_order_date=("order_date", "min"))
        .reset_index()
    )
    first_orders["cohort_month"] = pd.to_datetime(first_orders["first_order_date"]).dt.to_period("M").astype(str)

    orders_with_cohort = member_clean[["customer_id", "order_date"]].drop_duplicates().merge(
        first_orders[["customer_id", "first_order_date", "cohort_month"]],
        on="customer_id",
        how="left",
    )
    orders_with_cohort["order_month"] = pd.to_datetime(orders_with_cohort["order_date"]).dt.to_period("M")
    orders_with_cohort["first_month"] = pd.to_datetime(
        orders_with_cohort["first_order_date"]
    ).dt.to_period("M")
    orders_with_cohort["month_diff"] = (
        orders_with_cohort["order_month"].dt.year - orders_with_cohort["first_month"].dt.year
    ) * 12 + (
        orders_with_cohort["order_month"].dt.month - orders_with_cohort["first_month"].dt.month
    )

    cohort_sizes = (
        first_orders.groupby("cohort_month")
        .agg(new_users=("customer_id", pd.Series.nunique))
        .reset_index()
    )
    cohort_retention = (
        orders_with_cohort[orders_with_cohort["month_diff"].between(0, 11)]
        .groupby(["cohort_month", "month_diff"])
        .agg(retained_users=("customer_id", pd.Series.nunique))
        .reset_index()
        .merge(cohort_sizes, on="cohort_month", how="left")
    )
    cohort_retention["retention_rate"] = (
        cohort_retention["retained_users"] / cohort_retention["new_users"] * 100
    ).round(2)

    retention_matrix = cohort_sizes.copy()
    for month_diff in range(1, 12):
        values = cohort_retention[cohort_retention["month_diff"] == month_diff][
            ["cohort_month", "retention_rate"]
        ].rename(columns={"retention_rate": f"m{month_diff}_retention_pct"})
        retention_matrix = retention_matrix.merge(values, on="cohort_month", how="left")

    order_level = (
        clean.groupby(["order_month", "InvoiceNo"])
        .agg(
            order_revenue=("line_revenue", "sum"),
            is_guest=("CustomerID", lambda values: bool(values.isna().all())),
        )
        .reset_index()
    )
    guest_metrics = (
        order_level.groupby("order_month")
        .agg(
            total_orders=("InvoiceNo", "count"),
            guest_orders=("is_guest", "sum"),
            total_revenue=("order_revenue", "sum"),
            guest_revenue=("order_revenue", lambda values: values[order_level.loc[values.index, "is_guest"]].sum()),
        )
        .reset_index()
    )
    guest_metrics["guest_order_share_pct"] = (
        guest_metrics["guest_orders"] / guest_metrics["total_orders"] * 100
    ).round(2)
    guest_metrics["guest_revenue_share_pct"] = (
        guest_metrics["guest_revenue"] / guest_metrics["total_revenue"] * 100
    ).round(2)
    guest_metrics["guest_avg_revenue_per_order"] = (
        guest_metrics["guest_revenue"] / guest_metrics["guest_orders"]
    ).round(2)
    guest_metrics = guest_metrics[
        [
            "order_month",
            "guest_orders",
            "total_orders",
            "guest_order_share_pct",
            "guest_revenue_share_pct",
            "guest_avg_revenue_per_order",
        ]
    ]

    jan_without_outlier_filter = df[
        (~df["InvoiceNo"].str.startswith("C", na=False))
        & (df["StockCode"].str.len() >= 5)
        & (df["Quantity"] > 0)
        & (df["UnitPrice"] > 0)
        & (df["InvoiceDate"].dt.to_period("M").astype(str) == "2011-01")
    ].copy()
    jan_daily_without_outlier_filter = (
        jan_without_outlier_filter.groupby(jan_without_outlier_filter["InvoiceDate"].dt.date)["line_revenue"]
        .sum()
        .reindex(pd.date_range("2011-01-01", "2011-01-31", freq="D").date, fill_value=0)
        .mean()
    )

    summary = {
        "dataset": {
            "source_file": SOURCE_CSV.name,
            "raw_rows": int(len(df)),
            "raw_columns": int(len(df.columns) - 1),
            "date_min": str(df["InvoiceDate"].min()),
            "date_max": str(df["InvoiceDate"].max()),
            "raw_unique_invoices": int(df["InvoiceNo"].nunique()),
            "raw_unique_customers_non_null": int(df["CustomerID"].nunique()),
        },
        "cleaned": {
            "rows": int(len(clean)),
            "revenue": round(float(clean["line_revenue"].sum()), 2),
            "unique_invoices": int(clean["InvoiceNo"].nunique()),
            "customers_including_guest_key": int(clean["customer_key"].nunique()),
            "guest_line_rows": int(clean["CustomerID"].isna().sum()),
            "guest_line_share_pct": pct(float(clean["CustomerID"].isna().mean())),
        },
        "data_quality": quality_rows,
        "consistency_note": {
            "jan_avg_daily_revenue_without_quantity_outlier_filter": round(float(jan_daily_without_outlier_filter), 2),
            "jan_avg_daily_revenue_with_quantity_outlier_filter": float(
                monthly_kpi.loc[monthly_kpi["order_month"] == "2011-01", "avg_daily_revenue"].iloc[0]
            ),
            "outlier_invoice": "541431",
            "outlier_quantity": 74215,
            "outlier_revenue": 77183.6,
        },
        "insights": {
            "nov_2011_avg_daily_revenue": float(
                monthly_kpi.loc[monthly_kpi["order_month"] == "2011-11", "avg_daily_revenue"].iloc[0]
            ),
            "dec_2011_avg_daily_revenue": float(
                monthly_kpi.loc[monthly_kpi["order_month"] == "2011-12", "avg_daily_revenue"].iloc[0]
            ),
            "jan_2011_avg_daily_revenue": float(
                monthly_kpi.loc[monthly_kpi["order_month"] == "2011-01", "avg_daily_revenue"].iloc[0]
            ),
            "nov_2011_guest_order_share_pct": float(
                guest_metrics.loc[guest_metrics["order_month"] == "2011-11", "guest_order_share_pct"].iloc[0]
            ),
            "nov_2011_guest_revenue_share_pct": float(
                guest_metrics.loc[guest_metrics["order_month"] == "2011-11", "guest_revenue_share_pct"].iloc[0]
            ),
            "nov_2011_guest_avg_revenue_per_order": float(
                guest_metrics.loc[guest_metrics["order_month"] == "2011-11", "guest_avg_revenue_per_order"].iloc[0]
            ),
            "cohort_2010_12_m11_retention_pct": float(
                retention_matrix.loc[
                    retention_matrix["cohort_month"] == "2010-12", "m11_retention_pct"
                ].iloc[0]
            ),
            "average_m1_retention_pct": round(
                float(retention_matrix["m1_retention_pct"].dropna().mean()), 2
            ),
        },
    }

    pd.DataFrame(quality_rows).to_csv(DATA_DIR / "data_quality_steps.csv", index=False, encoding="utf-8-sig")
    monthly_kpi.to_csv(DATA_DIR / "monthly_kpi.csv", index=False, encoding="utf-8-sig")
    cohort_retention.to_csv(DATA_DIR / "cohort_retention_long.csv", index=False, encoding="utf-8-sig")
    retention_matrix.to_csv(DATA_DIR / "cohort_retention_matrix.csv", index=False, encoding="utf-8-sig")
    guest_metrics.to_csv(DATA_DIR / "guest_metrics.csv", index=False, encoding="utf-8-sig")

    dashboard_data = {
        "summary": summary,
        "data_quality": quality_rows,
        "monthly_kpi": records(monthly_kpi),
        "cohort_retention_matrix": records(retention_matrix),
        "guest_metrics": records(guest_metrics),
    }
    with (DATA_DIR / "dashboard_data.json").open("w", encoding="utf-8") as handle:
        json.dump(dashboard_data, handle, ensure_ascii=False, indent=2)

    with (DATA_DIR / "analysis_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
