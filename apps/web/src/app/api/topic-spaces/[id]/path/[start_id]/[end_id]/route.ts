import { api } from "@/trpc/server";
import { NextResponse } from "next/server";

export const GET = async (
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; start_id: string; end_id: string }> },
) => {
  try {
    const { id, start_id, end_id } = await params;
    const res = await api.topicSpaces.getPath({
      id,
      startId: start_id,
      endId: end_id,
    });

    return NextResponse.json({
      id: res.id,
      graphData: res.graphData,
    });
  } catch (error) {
    throw error;
  }
};
