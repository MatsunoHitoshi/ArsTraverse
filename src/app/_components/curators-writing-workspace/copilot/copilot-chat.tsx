"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("workspace");
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasAnalyzedRef = useRef<string | null>(null);

  const buildGreetingContent = (
    body: string,
    includeAskLayout = true,
  ): string => {
    let content = `${t("copilotGreeting")}\n\n${body}`;
    if (includeAskLayout) {
      content += `\n${t("copilotAskLayout")}`;
    }
    return content;
  };

  const analyzeInsights = api.kg.analyzeGraphInsights.useMutation({
    onSuccess: (data) => {
      const insights = data.insights;
      let body = "";

      if (insights.summary) {
        body += `${t("copilotGraphFeatures")}\n\n`;
        body += insights.summary;
        body += "\n\n";

        if (insights.centralConcepts.nodes.length > 0) {
          body += `${t("copilotCentralConcepts")}\n\n`;
          body += insights.centralConcepts.summary;
          body += "\n\n";
        }

        if (insights.layoutSuggestions.length > 0) {
          body += `${t("copilotLayoutSuggestions")}\n\n`;
          insights.layoutSuggestions.slice(0, 3).forEach((suggestion) => {
            body += `- **${suggestion.name}**: ${suggestion.description}\n`;
          });
          body += "\n";
        }
      } else {
        body += t("copilotLoadGraphHint");
      }

      setMessages([
        {
          role: "assistant",
          content: buildGreetingContent(body),
        },
      ]);
    },
    onError: (error) => {
      console.error("Failed to analyze graph insights:", error);
      setMessages([
        {
          role: "assistant",
          content: buildGreetingContent(t("copilotAnalysisError"), false),
        },
      ]);
    },
  });

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: buildGreetingContent(t("copilotAnalyzing"), false),
    },
  ]);

  const askCopilot = api.kg.askCopilot.useMutation({
    onSuccess: (data) => {
      const contentToShow = data.rawResponse ?? data.reply;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: contentToShow },
      ]);
      if (data.layoutInstruction && onLayoutInstruction) {
        onLayoutInstruction(data.layoutInstruction);
      }
      if (onFilteredGraphData) {
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
          content: `${t("copilotError")} ${error.message}`,
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

  useEffect(() => {
    const graphHash = currentGraphData?.nodes
      ? `${currentGraphData.nodes.length}-${currentGraphData.relationships.length}-${workspaceId}`
      : null;

    if (hasAnalyzedRef.current === graphHash) {
      return;
    }

    if (currentGraphData?.nodes && currentGraphData.nodes.length > 0) {
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
          content: buildGreetingContent(t("copilotLoadGraphHint")),
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
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-200">
          {t("copilotAssistant")}
        </h2>
      </div>

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
              <span>{t("copilotThinking")}</span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-700 bg-slate-800 p-3"
      >
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("copilotPlaceholder")}
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
