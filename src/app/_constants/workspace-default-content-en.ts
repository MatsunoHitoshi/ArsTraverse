export const DEFAULT_EMPTY_WORKSPACE_CONTENT_EN = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "How to use your workspace" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This is an initial guide. Once you understand the flow, delete this text and start writing.",
        },
      ],
    },
    {
      type: "paragraph",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "1. Write in your own style" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "You can write in this editor (your work is saved automatically). Use headings, bold text, lists, and quotes to shape readable prose.",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Heading example:",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: ' Organize sections such as "Chapter 1 Background" and "Chapter 2 Key points"',
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Bold example:",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: " Emphasize important terms (",
                },
                {
                  type: "text",
                  text: "work titles",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: ", ",
                },
                {
                  type: "text",
                  text: "people",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: ", ",
                },
                {
                  type: "text",
                  text: "concepts",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: ")",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Bullet list example:",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: " List key points briefly so readers can follow the flow",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "2. Reference concepts with auto-highlight" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "To reduce the friction of switching between writing and source material, you can reference the knowledge graph built from your sources while you write. Words that appear in referenced graph nodes are highlighted automatically in the editor.",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Click a highlighted term to focus the corresponding node in the graph on the right and explore related connections",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "While writing, confirm on the spot which concepts appear and how they relate",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Below is an example of smoothly referencing source information through automatic highlighting.",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/images/onboarding/autohighlight.gif",
        alt: "Auto-highlight and concept reference",
        title: "Auto-highlight and concept reference",
        width: "726",
        height: "496",
      },
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "You can also search citations in the panel below a filtered graph to see how a selected node is mentioned across sources—an index-like experience while following relationships.",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/images/onboarding/reference.gif",
        alt: "Citation search",
        title: "Citation search",
        width: "726",
        height: "496",
      },
    },
    {
      type: "paragraph",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [
        { type: "text", text: "3. Build structure with storytelling mode" },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "It can be hard to weave peripheral material from sources into a single narrative. In storytelling mode, the graph is laid out along the order of your text, and communities detected in the knowledge graph are matched to chapter content.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "At the paragraph level, AI (a large language model) identifies nodes and edges and links each part of your outline to what it refers to.",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/images/onboarding/storytelling.gif",
        alt: "Story creation",
        title: "Story creation",
        width: "726",
        height: "496",
      },
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "By aligning surrounding knowledge graph context with your outline, you can complement your narrative while conveying related information.",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/images/onboarding/storytelling2.gif",
        alt: "Story creation",
        title: "Story creation",
        width: "726",
        height: "496",
      },
    },
    {
      type: "paragraph",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Good first steps" }],
    },
    {
      type: "orderedList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Rename the workspace in the top right to match your theme",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Write a few paragraphs and try auto-highlight with the right panel",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "When comfortable, review the overall structure in storytelling mode",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "You can delete this guide whenever you no longer need it.",
        },
      ],
    },
  ],
} as const;
