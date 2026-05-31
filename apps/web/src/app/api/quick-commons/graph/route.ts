import { NextResponse } from "next/server";
import { api } from "@/trpc/server";
import { env } from "@/env";
import { createCorsResponse, createCorsOptionsResponse } from "../cors";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return createCorsOptionsResponse(origin);
}

export async function GET(request: Request) {
  try {
    if (!env.QUICK_COMMONS_TOPICSPACE_ID) {
      const response = NextResponse.json(
        { error: "Quick Commons API is not configured" },
        { status: 500 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    const res = await api.topicSpaces.getByIdPublic({
      id: env.QUICK_COMMONS_TOPICSPACE_ID,
    });

    const response = NextResponse.json({
      id: res.id,
      name: res.name,
      description: res.description,
      graphData: res.graphData,
    });
    const origin = request.headers.get("origin");
    return createCorsResponse(response, origin);
  } catch (error) {
    console.error("Error in graph endpoint:", error);
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
    const origin = request.headers.get("origin");
    return createCorsResponse(response, origin);
  }
}
