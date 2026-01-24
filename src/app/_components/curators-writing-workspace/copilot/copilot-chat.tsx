import { useState, useRef, useEffect } from "react";
import { Button } from "@/app/_components/button/button";
import { PaperPlaneIcon } from "@/app/_components/icons";
import { api } from "@/trpc/react";
import type {
  GraphDocumentForFrontend,
  LayoutInstruction,
  CuratorialContext,
} from "@/app/const/types";
import { Loading } from "../../loading/loading";
import Markdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CopilotChatProps {
  workspaceId: string;
  currentGraphData?: GraphDocumentForFrontend | null;
  curatorialContext?: CuratorialContext;
  currentLayoutInstruction?: LayoutInstruction | null;
  onLayoutInstruction?: (instruction: LayoutInstruction) => void;
  onFilteredGraphData?: (
    filteredGraph: GraphDocumentForFrontend | null,
  ) => void;
  className?: string;
}

export const CopilotChat = ({
  workspaceId,
  currentGraphData,
  curatorialContext,
  currentLayoutInstruction,
  onLayoutInstruction,
  onFilteredGraphData,
  className,
}: CopilotChatProps) => {
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasAnalyzedRef = useRef<string | null>(null); // 分析済みのグラフIDを追跡

  // LLMからグラフの洞察を取得
  const analyzeInsights = api.kg.analyzeGraphInsights.useMutation({
    onSuccess: (data) => {
      const insights = data.insights;
      let content =
        "こんにちは！ArsTraverse Copilotです。グラフの可視化や解釈についてお手伝いします。\n\n";

      if (insights.summary) {
        content += "## グラフの特徴\n\n";
        content += insights.summary;
        content += "\n\n";

        // 中心的な概念
        if (insights.centralConcepts.nodes.length > 0) {
          content += "### 中心的な概念\n\n";
          content += insights.centralConcepts.summary;
          content += "\n\n";
        }

        // レイアウト提案がある場合
        if (insights.layoutSuggestions.length > 0) {
          content += "### レイアウト提案\n\n";
          insights.layoutSuggestions.slice(0, 3).forEach((suggestion) => {
            content += `- **${suggestion.name}**: ${suggestion.description}\n`;
          });
          content += "\n";
        }
      } else {
        content += "グラフデータが読み込まれると、詳細な分析を表示します。";
      }

      content += "\nグラフのレイアウト変更や分析について質問してください！";

      setMessages([
        {
          role: "assistant",
          content,
        },
      ]);
    },
    onError: (error) => {
      console.error("Failed to analyze graph insights:", error);
      setMessages([
        {
          role: "assistant",
          content:
            "こんにちは！ArsTraverse Copilotです。グラフの可視化や解釈についてお手伝いします。\n\nグラフの分析中にエラーが発生しました。",
        },
      ]);
    },
  });

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "こんにちは！ArsTraverse Copilotです。グラフの可視化や解釈についてお手伝いします。\n\nグラフを分析中です...",
    },
  ]);

  const askCopilot = api.kg.askCopilot.useMutation({
    onSuccess: (data) => {
      // rawResponseがあればそれを使用、なければreplyを使用
      const contentToShow = data.rawResponse ?? data.reply;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: contentToShow },
      ]);
      if (data.layoutInstruction && onLayoutInstruction) {
        onLayoutInstruction(data.layoutInstruction);
      }
      if (onFilteredGraphData) {
        // GraphDocumentFrontendSchemaの型とGraphDocumentForFrontendの型が
        // propertiesの型で異なるが、実際のデータは互換性があるため型アサーションを使用
        onFilteredGraphData(
          (data.filteredGraphData as GraphDocumentForFrontend | undefined) ??
            null,
        );
      }
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "エラーが発生しました: " + error.message,
        },
      ]);
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || askCopilot.isPending) return;

    const userMessage = query;
    setQuery("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    askCopilot.mutate({
      workspaceId,
      query: userMessage,
      currentGraphData: currentGraphData ?? undefined,
      curatorialContext,
      currentLayoutInstruction: currentLayoutInstruction ?? undefined,
    });
  };

  // グラフデータが変更されたら洞察を取得
  useEffect(() => {
    // グラフデータのハッシュを生成（ノード数とリレーション数で簡易的に判定）
    const graphHash = currentGraphData?.nodes
      ? `${currentGraphData.nodes.length}-${currentGraphData.relationships.length}-${workspaceId}`
      : null;

    // 既に同じグラフを分析済みの場合はスキップ
    if (hasAnalyzedRef.current === graphHash) {
      return;
    }

    if (currentGraphData?.nodes && currentGraphData.nodes.length > 0) {
      // 分析中フラグを設定
      hasAnalyzedRef.current = graphHash;

      analyzeInsights.mutate({
        workspaceId,
        currentGraphData,
        curatorialContext,
      });
    } else {
      hasAnalyzedRef.current = null;
      setMessages([
        {
          role: "assistant",
          content:
            "こんにちは！ArsTraverse Copilotです。グラフの可視化や解釈についてお手伝いします。\n\nグラフデータが読み込まれると、詳細な分析を表示します。",
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGraphData, workspaceId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      className={`flex h-full flex-col border-l border-slate-700 bg-slate-900 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-200">アシスタント</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "whitespace-pre-wrap bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-200"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <Markdown>{msg.content}</Markdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {askCopilot.isPending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-200">
              <Loading color="white" size={20} />
              <span>考え中...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-700 bg-slate-800 p-3"
      >
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="グラフのレイアウトを変更して..."
            className="flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            disabled={askCopilot.isPending}
          />
          <Button
            type="submit"
            size="small"
            disabled={!query.trim() || askCopilot.isPending}
            className="flex !h-9 !w-9 items-center justify-center"
          >
            <PaperPlaneIcon height={16} width={16} />
          </Button>
        </div>
      </form>
    </div>
  );
};
