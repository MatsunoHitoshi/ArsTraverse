import { NextResponse } from "next/server";
import { api } from "@/trpc/server";

export const GET = async (_request: Request) => {
  const url = new URL(_request.url);
  const query = Object.fromEntries(url.searchParams);
  try {
    console.log("params?.type: ", query?.type);
    if (query?.type === "pdf") {
      const res = await api.sourceDocument.cleaningInputFiles({
        type: "input-pdf",
        key: query?.key ?? "",
      });
      return NextResponse.json(res);
    } else if (query?.type === "txt") {
      const res = await api.sourceDocument.cleaningInputFiles({
        type: "input-txt",
        key: query?.key ?? "",
      });
      return NextResponse.json(res);
    } else {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
  } catch (error) {
    throw error;
  }
};
