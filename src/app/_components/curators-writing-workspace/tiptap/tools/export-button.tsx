import { ShareIcon } from "@/app/_components/icons";
import { Editor } from "@tiptap/core";
import { TeiConverter } from "../tei/tei-converter";
import { exportXML } from "@/app/_utils/sys/xml";

const ExportButton = ({ editor }: { editor: Editor }) => {
  return (
    <button
      className="rounded-lg bg-black/20 p-2 backdrop-blur-sm"
      onClick={() => {
        const html = editor.getHTML();
        const tei = TeiConverter.toTeiBody(html);
        console.log(tei);
        exportXML(tei);
      }}
    >
      <ShareIcon height={16} width={16} color="white" />
    </button>
  );
};

export default ExportButton;
