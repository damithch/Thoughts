import { NextResponse } from "next/server";

import { parseDateRange } from "@/lib/attention/rules";
import { getCurrentUser } from "@/lib/auth";
import { getTherapyReportData, parseSections } from "@/lib/reports/therapy-data";
import { renderTherapyReportPdf } from "@/lib/reports/therapy-pdf";
import { getCurrentColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

// GET /api/reports/therapy?from=YYYY-MM-DD&to=YYYY-MM-DD&sections=attention,worry&format=pdf|json
// Attention training and worry postponement homework for a date range (at most 92 days).
// Signed in with the web cookie or the phone's bearer token.
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const range = parseDateRange(params.get("from"), params.get("to"), getCurrentColomboDate());

  if (!range.ok) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  const format = params.get("format") ?? "pdf";
  if (format !== "pdf" && format !== "json") {
    return NextResponse.json({ error: "format must be pdf or json." }, { status: 400 });
  }

  try {
    const data = await getTherapyReportData(user, range.from, range.to, parseSections(params.get("sections")));
    const fileName = `thoughts-therapy-report-${range.from}-to-${range.to}`;

    if (format === "json") {
      return NextResponse.json(data, {
        headers: { "Content-Disposition": `attachment; filename="${fileName}.json"` },
      });
    }

    const pdf = await renderTherapyReportPdf(data);

    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Therapy report failed.", error);
    return NextResponse.json({ error: "The report couldn't be created. Try again." }, { status: 500 });
  }
}
