import { ShareIcon } from "@/app/_components/icons";
import { Editor } from "@tiptap/core";
import { TeiConverter } from "../tei/tei-converter";
import { exportXML } from "@/app/_utils/sys/xml";

const TeiExportButton = ({ editor }: { editor: Editor }) => {
  return (
    <button
      className="flex flex-row items-center gap-1 rounded-lg bg-black/75 p-2 text-xs backdrop-blur-sm"
      onClick={() => {
        const html = editor.getHTML();
        const tei = TeiConverter.toTeiBody(html);
        console.log(tei);
        exportXML(tei);
      }}
    >
      TEI
      <ShareIcon height={16} width={16} color="white" />
    </button>
  );
};

export default TeiExportButton;
