-- BigQuery Standard SQL
-- 프로젝트: 온라인 쇼핑몰 성장성, 리텐션, 비회원 주문 분석
-- 원본 테이블: prime_career.ecommerce_data

-- ---------------------------------------------------------------------------
-- 1) 데이터 품질 점검: 전처리 단계별 행 수 변화
-- ---------------------------------------------------------------------------
WITH
raw AS (
  SELECT *
  FROM `prime_career.ecommerce_data`
),
step_cancel_removed AS (
  SELECT *
  FROM raw
  WHERE InvoiceNo NOT LIKE 'C%'
),
step_stockcode_removed AS (
  SELECT *
  FROM step_cancel_removed
  WHERE LENGTH(CAST(StockCode AS STRING)) >= 5
),
step_quantity_removed AS (
  SELECT *
  FROM step_stockcode_removed
  WHERE Quantity > 0
),
step_unitprice_removed AS (
  SELECT *
  FROM step_quantity_removed
  WHERE UnitPrice > 0
),
step_outliers_removed AS (
  SELECT *
  FROM step_unitprice_removed
  WHERE Quantity NOT IN (80995, 74215)
)
SELECT 1 AS step_order, 'raw' AS step_name, COUNT(*) AS rows_remaining FROM raw
UNION ALL
SELECT 2, 'remove_cancel_invoice', COUNT(*) FROM step_cancel_removed
UNION ALL
SELECT 3, 'remove_short_stock_code', COUNT(*) FROM step_stockcode_removed
UNION ALL
SELECT 4, 'remove_non_positive_quantity', COUNT(*) FROM step_quantity_removed
UNION ALL
SELECT 5, 'remove_non_positive_unit_price', COUNT(*) FROM step_unitprice_removed
UNION ALL
SELECT 6, 'remove_quantity_outliers', COUNT(*) FROM step_outliers_removed
ORDER BY step_order;


-- ---------------------------------------------------------------------------
-- 2) 월별 일평균 KPI
-- ---------------------------------------------------------------------------
WITH
cleaned_line_items AS (
  SELECT
    InvoiceNo,
    StockCode,
    Description,
    Quantity,
    TIMESTAMP(InvoiceDate) AS invoice_ts,
    DATE(TIMESTAMP(InvoiceDate)) AS order_date,
    UnitPrice,
    COALESCE(CAST(CustomerID AS STRING), 'Guest') AS customer_key,
    CustomerID,
    Country,
    Quantity * UnitPrice AS line_revenue
  FROM `prime_career.ecommerce_data`
  WHERE InvoiceNo NOT LIKE 'C%'
    AND LENGTH(CAST(StockCode AS STRING)) >= 5
    AND Quantity > 0
    AND UnitPrice > 0
    AND Quantity NOT IN (80995, 74215)
),
date_series AS (
  SELECT DATE_ADD('2010-12-01', INTERVAL n DAY) AS order_date
  FROM UNNEST(GENERATE_ARRAY(0, DATE_DIFF('2011-12-09', '2010-12-01', DAY))) AS n
),
daily_stats AS (
  SELECT
    d.order_date,
    FORMAT_DATE('%Y-%m', d.order_date) AS order_month,
    COALESCE(SUM(c.line_revenue), 0) AS daily_revenue,
    COALESCE(COUNT(DISTINCT c.customer_key), 0) AS daily_customers,
    COALESCE(COUNT(DISTINCT c.InvoiceNo), 0) AS daily_orders
  FROM date_series d
  LEFT JOIN cleaned_line_items c
    ON d.order_date = c.order_date
  GROUP BY d.order_date, order_month
)
SELECT
  order_month,
  ROUND(AVG(daily_revenue), 2) AS avg_daily_revenue,
  ROUND(AVG(daily_customers), 2) AS avg_daily_customers,
  ROUND(AVG(daily_orders), 2) AS avg_daily_orders
FROM daily_stats
GROUP BY order_month
ORDER BY order_month;


-- ---------------------------------------------------------------------------
-- 3) 최초 관측 구매월 기준 코호트 리텐션
-- 주의: 데이터가 2010-12부터 시작되므로 첫 코호트에는 관측 기간 이전부터
-- 구매하던 기존 고객이 포함되었을 수 있다.
-- ---------------------------------------------------------------------------
WITH
cleaned_members AS (
  SELECT
    CAST(CustomerID AS STRING) AS customer_id,
    DATE(TIMESTAMP(InvoiceDate)) AS order_date
  FROM `prime_career.ecommerce_data`
  WHERE InvoiceNo NOT LIKE 'C%'
    AND LENGTH(CAST(StockCode AS STRING)) >= 5
    AND Quantity > 0
    AND UnitPrice > 0
    AND Quantity NOT IN (80995, 74215)
    AND CustomerID IS NOT NULL
),
first_orders AS (
  SELECT
    customer_id,
    MIN(order_date) AS first_order_date,
    FORMAT_DATE('%Y-%m', MIN(order_date)) AS cohort_month
  FROM cleaned_members
  GROUP BY customer_id
),
orders_with_cohort AS (
  SELECT DISTINCT
    c.customer_id,
    f.cohort_month,
    DATE_DIFF(
      DATE_TRUNC(c.order_date, MONTH),
      DATE_TRUNC(f.first_order_date, MONTH),
      MONTH
    ) AS month_diff
  FROM cleaned_members c
  JOIN first_orders f
    ON c.customer_id = f.customer_id
),
cohort_sizes AS (
  SELECT
    cohort_month,
    COUNT(DISTINCT customer_id) AS new_users
  FROM first_orders
  GROUP BY cohort_month
),
cohort_retention AS (
  SELECT
    cohort_month,
    month_diff,
    COUNT(DISTINCT customer_id) AS retained_users
  FROM orders_with_cohort
  WHERE month_diff BETWEEN 0 AND 11
  GROUP BY cohort_month, month_diff
)
SELECT
  r.cohort_month,
  r.month_diff,
  s.new_users,
  r.retained_users,
  ROUND(100 * SAFE_DIVIDE(r.retained_users, s.new_users), 2) AS retention_rate
FROM cohort_retention r
JOIN cohort_sizes s
  ON r.cohort_month = s.cohort_month
ORDER BY r.cohort_month, r.month_diff;


-- ---------------------------------------------------------------------------
-- 4) 비회원 주문 지표
-- ---------------------------------------------------------------------------
WITH
cleaned_line_items AS (
  SELECT
    InvoiceNo,
    DATE_TRUNC(DATE(TIMESTAMP(InvoiceDate)), MONTH) AS order_month,
    CustomerID,
    Quantity * UnitPrice AS line_revenue
  FROM `prime_career.ecommerce_data`
  WHERE InvoiceNo NOT LIKE 'C%'
    AND LENGTH(CAST(StockCode AS STRING)) >= 5
    AND Quantity > 0
    AND UnitPrice > 0
    AND Quantity NOT IN (80995, 74215)
),
order_level AS (
  SELECT
    order_month,
    InvoiceNo,
    LOGICAL_AND(CustomerID IS NULL) AS is_guest,
    SUM(line_revenue) AS order_revenue
  FROM cleaned_line_items
  GROUP BY order_month, InvoiceNo
),
monthly AS (
  SELECT
    order_month,
    COUNT(*) AS total_orders,
    COUNTIF(is_guest) AS guest_orders,
    SUM(order_revenue) AS total_revenue,
    SUM(IF(is_guest, order_revenue, 0)) AS guest_revenue
  FROM order_level
  GROUP BY order_month
)
SELECT
  FORMAT_DATE('%Y-%m', order_month) AS order_month,
  guest_orders,
  total_orders,
  ROUND(SAFE_DIVIDE(guest_orders, total_orders) * 100, 2) AS guest_order_share_pct,
  ROUND(SAFE_DIVIDE(guest_revenue, total_revenue) * 100, 2) AS guest_revenue_share_pct,
  ROUND(SAFE_DIVIDE(guest_revenue, guest_orders), 2) AS guest_avg_revenue_per_order
FROM monthly
ORDER BY order_month;
