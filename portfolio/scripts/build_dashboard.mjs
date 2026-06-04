import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../..");
const portfolioDir = path.join(root, "portfolio");
const dataPath = path.join(portfolioDir, "data", "dashboard_data.json");
const outputPath = path.join(portfolioDir, "dashboard", "이커머스_성장_리텐션_대시보드.xlsx");
const previewDir = path.join(portfolioDir, "previews");

const data = JSON.parse(await fs.readFile(dataPath, "utf8"));

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add("요약");
const monthlySheet = workbook.worksheets.add("월별 KPI");
const retentionSheet = workbook.worksheets.add("코호트 리텐션");
const guestSheet = workbook.worksheets.add("비회원 지표");
const qualitySheet = workbook.worksheets.add("데이터 품질");

const colors = {
  ink: "#1F2937",
  muted: "#6B7280",
  paper: "#FFFFFF",
  panel: "#F8FAFC",
  border: "#D1D5DB",
  teal: "#0F766E",
  blue: "#2563EB",
  amber: "#F59E0B",
  rose: "#BE123C",
  greenLight: "#DCFCE7",
  yellowLight: "#FEF3C7",
  redLight: "#FEE2E2",
};

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getCell(0, index).format.columnWidthPx = width;
  });
}

function title(sheet, range, text, subtitle = null) {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[text]];
  sheet.getRange(range).format = {
    fill: colors.ink,
    font: { color: colors.paper, bold: true, size: 18 },
    verticalAlignment: "center",
  };
  sheet.getRange(range).format.rowHeightPx = 38;
  if (subtitle) {
    const [leftCell] = range.split(":");
    const row = Number(leftCell.match(/\d+/)[0]) + 1;
    sheet.getRange(`A${row}:N${row}`).merge();
    sheet.getRange(`A${row}:N${row}`).values = [[subtitle]];
    sheet.getRange(`A${row}:N${row}`).format = {
      fill: colors.ink,
      font: { color: "#E5E7EB", size: 10 },
      verticalAlignment: "center",
    };
    sheet.getRange(`A${row}:N${row}`).format.rowHeightPx = 24;
  }
}

function writeTable(sheet, startCell, headers, rows, options = {}) {
  const start = sheet.getRange(startCell);
  const values = [headers, ...rows];
  const range = start.write(values);
  range.format = {
    font: { color: colors.ink },
    wrapText: true,
    borders: {
      insideHorizontal: { style: "continuous", color: "#E5E7EB" },
      insideVertical: { style: "continuous", color: "#E5E7EB" },
      edgeBottom: { style: "continuous", color: colors.border },
    },
  };
  range.getRow(0).format = {
    fill: options.headerFill ?? colors.teal,
    font: { color: colors.paper, bold: true },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  return range;
}

function metricCard(sheet, range, label, value, note, fill) {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[`${label}\n${value}\n${note}`]];
  sheet.getRange(range).format = {
    fill,
    font: { color: colors.ink, bold: true, size: 12 },
    wrapText: true,
    verticalAlignment: "center",
    horizontalAlignment: "center",
    borders: {
      edgeTop: { style: "continuous", color: colors.border },
      edgeBottom: { style: "continuous", color: colors.border },
      edgeLeft: { style: "continuous", color: colors.border },
      edgeRight: { style: "continuous", color: colors.border },
    },
  };
}

function fmtNumber(value, digits = 0) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function retentionFill(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "#F9FAFB";
  const numeric = Number(value);
  if (numeric >= 35) return "#86EFAC";
  if (numeric >= 25) return "#BBF7D0";
  if (numeric >= 18) return "#FEF3C7";
  return "#FECACA";
}

const qualityStepLabels = {
  raw: "원본",
  remove_cancel_invoice: "취소 거래 제거",
  remove_short_stock_code: "특수 코드 제거",
  remove_non_positive_quantity: "비정상 수량 제거",
  remove_non_positive_unit_price: "비정상 단가 제거",
  remove_quantity_outliers: "대량 이상치 제거",
};

// Executive summary
summarySheet.showGridLines = false;
setWidths(summarySheet, [120, 95, 95, 22, 120, 95, 95, 22, 120, 95, 95, 22, 120, 95, 95]);
for (let row = 1; row <= 38; row += 1) {
  summarySheet.getRange(`A${row}:N${row}`).format.rowHeightPx = row <= 2 ? 32 : 24;
}
title(
  summarySheet,
  "A1:N1",
  "온라인 쇼핑몰 성장성·리텐션·비회원 주문 분석",
  "2010-12-01~2011-12-09 | 정제 후 거래 라인: 527,801건 | 포트폴리오 대시보드"
);

const insights = data.summary.insights;
const cleaned = data.summary.cleaned;
metricCard(summarySheet, "A4:C7", "정제 후 매출", fmtNumber(cleaned.revenue, 2), "전처리 기준 적용", "#DBEAFE");
metricCard(summarySheet, "E4:G7", "11월 일평균 매출", fmtNumber(insights.nov_2011_avg_daily_revenue, 2), "Q4 수요 피크", "#D1FAE5");
metricCard(summarySheet, "I4:K7", "11월 비회원 매출 비중", `${insights.nov_2011_guest_revenue_share_pct}%`, "주문 비중은 3.96%", "#FEF3C7");
metricCard(summarySheet, "M4:N7", "+1개월 리텐션", `${insights.average_m1_retention_pct}%`, "초기 이탈 관리 필요", "#FCE7F3");

summarySheet.getRange("A9:N9").merge();
summarySheet.getRange("A9:N9").values = [["핵심 해석"]];
summarySheet.getRange("A9:N9").format = {
  fill: colors.panel,
  font: { color: colors.ink, bold: true, size: 13 },
};
const takeawayRows = [
  ["성장성", "2011년 하반기부터 일평균 매출·고객 수·주문 수가 함께 상승하며, 11월과 12월 초가 피크 구간을 형성한다."],
  ["리텐션", "대부분의 코호트는 첫 구매 후 1개월 차에 크게 이탈한 뒤 20~30%대에서 유지된다. 2010-12 코호트는 장기 유지 신호가 강하지만 기존 고객이 섞였을 수 있다."],
  ["비회원 주문", "11월 비회원 주문 비중은 낮지만 매출 비중은 높다. 이는 고액 비회원 또는 B2B성 구매 행동이 유입되었을 가능성을 시사한다."],
  ["실행안", "4분기 사전 주문 캠페인, 고액 비회원 구매자의 결제 후 회원화, 7/21/30일 재구매 유도 플로우를 우선 실행한다."],
];
summarySheet.getRange("A10:B10").merge();
summarySheet.getRange("C10:N10").merge();
summarySheet.getRange("A10:B10").values = [["분석 축"]];
summarySheet.getRange("C10:N10").values = [["해석"]];
summarySheet.getRange("A10:N10").format = {
  fill: colors.blue,
  font: { color: colors.paper, bold: true },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
takeawayRows.forEach(([theme, interpretation], index) => {
  const row = 11 + index;
  summarySheet.getRange(`A${row}:B${row}`).merge();
  summarySheet.getRange(`C${row}:N${row}`).merge();
  summarySheet.getRange(`A${row}:B${row}`).values = [[theme]];
  summarySheet.getRange(`C${row}:N${row}`).values = [[interpretation]];
  summarySheet.getRange(`A${row}:N${row}`).format = {
    fill: index % 2 === 0 ? colors.paper : colors.panel,
    font: { color: colors.ink },
    wrapText: true,
    verticalAlignment: "center",
    borders: {
      edgeBottom: { style: "continuous", color: "#E5E7EB" },
    },
  };
  summarySheet.getRange(`A${row}:N${row}`).format.rowHeightPx = 44;
});

// 월별 KPI 시트
monthlySheet.showGridLines = false;
setWidths(monthlySheet, [105, 135, 135, 125, 115, 115, 115]);
title(monthlySheet, "A1:G1", "월별 KPI", "전체 날짜 캘린더 기준으로 계산한 일평균 지표");
const monthlyRows = data.monthly_kpi.map((row) => [
  row.order_month,
  row.avg_daily_revenue,
  row.avg_daily_customers,
  row.avg_daily_orders,
  row.revenue_mom_pct,
  row.customers_mom_pct,
  row.orders_mom_pct,
]);
writeTable(
  monthlySheet,
  "A4",
  ["거래월", "일평균 매출", "일평균 고객 수", "일평균 주문 수", "매출 전월 대비(%)", "고객 수 전월 대비(%)", "주문 수 전월 대비(%)"],
  monthlyRows,
  { headerFill: colors.teal }
);
monthlySheet.getRange("B5:B17").format.numberFormat = "#,##0.00";
monthlySheet.getRange("C5:D17").format.numberFormat = "#,##0.00";
monthlySheet.getRange("E5:G17").format.numberFormat = "0.00";
const monthlyChart = monthlySheet.charts.add("line", monthlySheet.getRange("A4:B17"));
monthlyChart.title = "월별 일평균 매출 추이";
monthlyChart.hasLegend = false;
monthlyChart.xAxis = { axisType: "textAxis" };
monthlyChart.yAxis = { numberFormatCode: "#,##0" };
monthlyChart.setPosition("I4", "Q22");

// 비회원 지표 시트
guestSheet.showGridLines = false;
setWidths(guestSheet, [105, 130, 130, 155, 105, 105]);
title(guestSheet, "A1:F1", "비회원 지표", "고객 ID가 없는 주문을 비회원 주문으로 정의");
const guestRows = data.guest_metrics.map((row) => [
  row.order_month,
  row.guest_order_share_pct,
  row.guest_revenue_share_pct,
  row.guest_avg_revenue_per_order,
  row.guest_orders,
  row.total_orders,
]);
writeTable(
  guestSheet,
  "A4",
  ["거래월", "비회원 주문 비중(%)", "비회원 매출 비중(%)", "비회원 주문당 평균 매출", "비회원 주문 수", "전체 주문 수"],
  guestRows,
  { headerFill: colors.amber }
);
guestSheet.getRange("B5:C17").format.numberFormat = "0.00";
guestSheet.getRange("D5:D17").format.numberFormat = "#,##0.00";
guestSheet.getRange("E5:F17").format.numberFormat = "#,##0";
const guestChart = guestSheet.charts.add("line", guestSheet.getRange("A4:C17"));
guestChart.title = "비회원 주문 비중 vs 매출 비중";
guestChart.hasLegend = true;
guestChart.xAxis = { axisType: "textAxis" };
guestChart.yAxis = { numberFormatCode: "0.00" };
guestChart.setPosition("H4", "P22");

// 코호트 리텐션 시트
retentionSheet.showGridLines = false;
setWidths(retentionSheet, [105, 90, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80]);
title(retentionSheet, "A1:M1", "코호트 리텐션", "최초 관측 구매월 기준 재구매율; 비회원 주문 제외");
const retentionHeaders = ["코호트", "신규 고객 수", "+1개월", "+2개월", "+3개월", "+4개월", "+5개월", "+6개월", "+7개월", "+8개월", "+9개월", "+10개월", "+11개월"];
const retentionRows = data.cohort_retention_matrix.map((row) => [
  row.cohort_month,
  row.new_users,
  row.m1_retention_pct,
  row.m2_retention_pct,
  row.m3_retention_pct,
  row.m4_retention_pct,
  row.m5_retention_pct,
  row.m6_retention_pct,
  row.m7_retention_pct,
  row.m8_retention_pct,
  row.m9_retention_pct,
  row.m10_retention_pct,
  row.m11_retention_pct,
]);
writeTable(retentionSheet, "A4", retentionHeaders, retentionRows, { headerFill: colors.rose });
retentionSheet.getRange("B5:B17").format.numberFormat = "#,##0";
retentionSheet.getRange("C5:M17").format.numberFormat = "0.00";
for (let row = 0; row < retentionRows.length; row += 1) {
  for (let col = 2; col < retentionHeaders.length; col += 1) {
    const cell = retentionSheet.getCell(row + 4, col);
    cell.format.fill = retentionFill(retentionRows[row][col]);
  }
}

retentionSheet.getRange("A20:M20").merge();
retentionSheet.getRange("A20:M20").values = [["읽는 법: 초록색에 가까울수록 재구매율이 높다. 빈 칸은 관측 기간이 끝나 해당 월차를 측정할 수 없다는 뜻이다."]];
retentionSheet.getRange("A20:M20").format = {
  fill: colors.panel,
  font: { color: colors.muted, italic: true },
  wrapText: true,
};

// 데이터 품질 시트
qualitySheet.showGridLines = false;
setWidths(qualitySheet, [170, 320, 130, 150, 140]);
title(qualitySheet, "A1:E1", "데이터 품질", "모든 포트폴리오 지표에 동일하게 적용한 전처리 기준");
const qualityRows = data.data_quality.map((row) => [
  qualityStepLabels[row.step] ?? row.step,
  row.description,
  row.rows_remaining,
  row.rows_removed_from_previous,
  row.rows_remaining_pct,
]);
writeTable(
  qualitySheet,
  "A4",
  ["단계", "전처리 규칙", "남은 행 수", "제거된 행 수", "잔존율(%)"],
  qualityRows,
  { headerFill: colors.blue }
);
qualitySheet.getRange("C5:D10").format.numberFormat = "#,##0";
qualitySheet.getRange("E5:E10").format.numberFormat = "0.00";
qualitySheet.getRange("A13:E13").merge();
qualitySheet.getRange("A13:E13").values = [[
  `일관성 확인: 대량 이상치 Quantity 74215를 제거한 뒤 2011년 1월 일평균 매출은 ${fmtNumber(
    data.summary.consistency_note.jan_avg_daily_revenue_with_quantity_outlier_filter,
    2
  )}이다. 해당 필터를 적용하지 않으면 ${fmtNumber(
    data.summary.consistency_note.jan_avg_daily_revenue_without_quantity_outlier_filter,
    2
  )}로 계산된다.`,
]];
qualitySheet.getRange("A13:E13").format = {
  fill: colors.yellowLight,
  font: { color: colors.ink, bold: true },
  wrapText: true,
};

for (const sheet of [summarySheet, monthlySheet, retentionSheet, guestSheet, qualitySheet]) {
  sheet.freezePanes.freezeRows(3);
}

await fs.mkdir(previewDir, { recursive: true });
for (const { sheetName, filename } of [
  { sheetName: "요약", filename: "summary_ko.png" },
  { sheetName: "월별 KPI", filename: "monthly_kpi_ko.png" },
  { sheetName: "코호트 리텐션", filename: "cohort_retention_ko.png" },
  { sheetName: "비회원 지표", filename: "guest_metrics_ko.png" },
  { sheetName: "데이터 품질", filename: "data_quality_ko.png" },
]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(path.join(previewDir, filename), new Uint8Array(await preview.arrayBuffer()));
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Saved ${outputPath}`);
