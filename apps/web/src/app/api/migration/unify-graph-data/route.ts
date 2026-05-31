// import { NextResponse } from "next/server";
// import { api } from "@/trpc/server";

// export async function POST(req: Request) {
//   try {
//     // tRPCのmutationを呼び出す
//     const result = await api.migration.unifyGraphData();
//     return NextResponse.json(result);
//   } catch (error) {
//     // tRPCプロシージャ内でエラーが投げられた場合
//     const errorMessage =
//       error instanceof Error ? error.message : "An unknown error occurred";
//     return NextResponse.json(
//       { success: false, logs: errorMessage.split("\n") },
//       { status: 500 },
//     );
//   }
// }
