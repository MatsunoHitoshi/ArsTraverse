import { Modal } from "../modal/modal";

export const DocumentUploadTipsModal = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="大きなファイルを読み込ませるときのTips"
    >
      <div className="flex flex-col gap-4">
        <div className="text-sm">
          一度にアップロードできるファイルのサイズには限りがありますが、pdfファイルを分割
          してアップロードした後に、統合することで大きなファイルを読み込ませることができます。
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-2 text-orange-500">
              <div>Step1</div>
              <div className="font-bold">
                ファイルを分割してアップロードする
              </div>
            </div>
            <div className="text-sm">
              例えば文献の中の各章ごとにPDFファイルを分割すると、
              それぞれの章を独立したファイルとして読み込ませることができます。
              分割したファイルをアップロードすると、「ドキュメント」が作成され
              それぞれの内容に対応する知識グラフが自動生成されます。
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-start gap-2 text-orange-500">
              <div>Step2</div>
              <div className="font-bold">
                ドキュメントを統合するための「場所」を作成する
              </div>
            </div>
            <div className="text-sm">
              それぞれのドキュメントから生成された知識グラフを統合するために、「リポジトリ」を作成します。
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-start gap-2 text-orange-500">
              <div>Step3</div>
              <div className="font-bold">リポジトリを統合する</div>
            </div>
            <div className="text-sm">
              リポジトリにそれぞれのドキュメントを追加すると、自動で知識グラフが統合されます。
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
