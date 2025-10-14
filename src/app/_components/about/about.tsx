import Image from "next/image";
import { TopGraph } from "./top-graph";

import { OgpScraper } from "../ogp/ogp-scraper";
import { FadeIn } from "../animation/fade-in";
import { Footer } from "./footer";
import Link from "next/link";

export const About = () => {
  return (
    <div className="flex w-full flex-col text-white">
      <div className="absolute top-0 z-0 w-full opacity-45">
        <div className="hidden sm:block">
          <TopGraph height={252 + 64} />
        </div>
        <div className="block sm:hidden">
          <TopGraph height={232 + 64} />
        </div>
      </div>
      <div className="relative z-10 flex w-full flex-col items-center gap-2 py-20">
        <h1 className="text-4xl font-bold sm:text-6xl">ArsTraverse</h1>
        <p>関係性の宇宙を横断する可視化アーカイブツール</p>
      </div>

      <div className="mx-auto flex w-full max-w-[960px] flex-col">
        <Section>
          <h2 className="text-2xl font-bold lg:text-3xl">
            芸術文化の文脈を可視化し、共に編集し、未来へアーカイブする
          </h2>
          <p className="container">
            ArsTraverse(アルストラバース)は、芸術文化に関わる研究者や学芸員の方々が、論文や書籍などの文献にある情報から、人物や作品、アイデアやコンセプトなどの
            「つながり（文脈）」
            を見つけ出し、それを図で分かりやすく整理したり、自身の考えを書き加えたりしながら、知識を深め、みんなで共有・議論していくための可視化アーカイブツールです。
          </p>

          <LinkButton href="/">ArsTraverseを試してみる</LinkButton>
        </Section>

        <Section className="bg-black/20">
          <h2 className="text-2xl font-bold lg:text-3xl">
            つながりを表現する「知識グラフ」とは？
          </h2>

          <div className="flex flex-col gap-8 md:flex-row">
            <div className="flex flex-col gap-4">
              <p className="container">
                ArsTraverseでは、 「知識グラフ」
                を芸術文化における調査、思考整理、そして他のユーザとの共有・共同作業の中心においています。
                知識グラフは、一見複雑な情報や関係性を、 「点（ノード）」 と
                「線（エッジ）」 で表現するデータのかたちです。例えば、{" "}
                <span className="text-orange-400">「作家A」</span> という点と{" "}
                <span className="text-orange-400">「作品X」</span>{" "}
                という点があり、その間を{" "}
                <span className="text-orange-400">「制作」</span>{" "}
                という線で結ぶことで、{" "}
                <span className="text-orange-400">
                  「作家Aが作品Xを制作した」
                </span>{" "}
                という関係性を視覚的に分かりやすく表現できます。
              </p>
              <div className="flex flex-col items-center md:hidden">
                <Image
                  src="/images/about/knowledge-graph.png"
                  alt="知識グラフ"
                  className="max-w-52"
                  width={1000}
                  height={1000}
                />
              </div>
              <p className="container">
                これにより、文献に書かれている人物、作品、概念、出来事などが互いにどのように関連しているかを直感的に把握できるようになります。
                物語のように文章で書かれている文脈情報を、この知識グラフとして整理することで、全体像を掴んだり、特定の関連性に着目したりすることが容易になります。
              </p>
            </div>
            <div className="hidden flex-col items-center md:flex">
              <Image
                src="/images/about/knowledge-graph.png"
                alt="知識グラフ"
                className="max-w-52"
                width={1000}
                height={1000}
              />
            </div>
          </div>
        </Section>

        <Section className="">
          <div className="divide-y divide-gray-700">
            <SubSection>
              <div className="flex flex-col gap-8">
                <h2 className="text-center text-2xl font-bold lg:text-3xl">
                  特徴
                </h2>
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <MainDescription title="文献から知識グラフ自動構築と可視化">
                    <div>
                      お手持ちの文献（PDFまたは手動入力）をアップロードするだけで、AIが作家や概念、作品間の関係性などを自動的に抽出し、知識グラフとして可視化します。
                      複数の文献から生成した知識グラフを統合することで、文献を横断するつながりも視覚的に把握できます。
                    </div>
                    <Image
                      src="/images/about/arstraverse-upload-dnd.gif"
                      alt="共同編集"
                      width={1080}
                      height={1080}
                    />
                  </MainDescription>
                  <MainDescription title="詳細な絞り込みや解説生成">
                    <div>
                      作成した知識グラフに対し、ノードやエッジを絞り込んで詳細なつながりを確認できます。AIを使ってそのつながりの解説やアウトラインを生成することもできます。
                    </div>
                    <Image
                      src="/images/about/arstraverse-filter-and-guide.gif"
                      alt="絞り込み"
                      width={1080}
                      height={1080}
                    />
                  </MainDescription>
                  <MainDescription title="直感的な情報編集" developing>
                    <div>
                      自動構築された知識グラフに対し、自分の知見や仮説、独自の主張を直接書き加えることができます。
                    </div>
                    <Image
                      src="/images/about/graph-editor.png"
                      alt="編集画面"
                      width={1000}
                      height={1000}
                    />
                  </MainDescription>
                  <MainDescription title="コミュニティでの共同編集" developing>
                    <div>
                      デジタルアーカイブとしての機能も開発中です。知識グラフを他のユーザと共有して、議論しながら共同でアーカイブを管理していくことができます。
                    </div>
                    <Image
                      src="/images/about/data-repository.png"
                      alt="共同編集"
                      width={1000}
                      height={1000}
                    />
                  </MainDescription>
                  {/* <MainDescription
                  title="展示などの発表用の柔軟なカスタマイズ"
                  developing
                >
                  <div>
                    作成した知識グラフを、展示パネル、研究論文の図、オンライン記事など、様々な用途に合わせてデザインやインタラクションを調整できます。
                  </div>
                </MainDescription> */}
                </div>
              </div>
            </SubSection>

            <SubSection>
              <div className="flex flex-col gap-8">
                <h2 className="text-center text-2xl font-bold lg:text-3xl">
                  活用シーン
                </h2>

                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    <MainDescription title="展覧会・記事の企画">
                      <div>
                        編集した知識グラフから解説文やアウトラインの下書きを生成しながら、展覧会や記事の内容をまとめていくことができます。
                        また、この知識グラフのダイアグラムを展覧会に設置して、よりインタラクティブな鑑賞体験を実現できます。
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-col items-start gap-1">
                          <div className="mt-1 flex h-6 w-max min-w-[64px] items-center justify-center rounded-full bg-orange-500 px-2 text-xs text-slate-900">
                            展示事例
                          </div>
                          <Link
                            className="text-base font-bold underline hover:no-underline"
                            target="_blank"
                            rel="noopener noreferrer"
                            href="https://www.museum-library-uki.jp/museum/project/2025/03/905/"
                          >
                            海にねむる龍 ―働正がのこしたもの　Tadashi Hataraki
                            and Echoes of Kyushu-ha
                          </Link>
                        </div>
                        <Image
                          src="/images/about/hataraki-and-kyushu-ha.png"
                          alt="展覧会事例"
                          width={1080}
                          height={1080}
                        />
                        <div className="text-xs">
                          ArsTraverseをベースに、展覧会のテーマである「働正(はたらき
                          ただし)」や「九州派」を取り巻く関係を視覚的に把握できるインタラクティブなダイアグラムを開発しました。年譜形式ではイメージしづらい同時代の相互作用や関係性、交流や交渉などの接点を、ダイアグラムで視覚的に表現しています。
                        </div>
                      </div>
                      <LinkButton href="https://docs.google.com/forms/d/e/1FAIpQLSfLwbbr5i3d_lLJ8V2eSqqJ-GGQaEkQa_FehAQ_OCU8kBRQ5g/viewform?usp=pp_url&entry.1186430411=%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%E5%86%85%E5%AE%B9%EF%BC%9AArsTraverse%E3%81%AB%E9%96%A2%E3%81%99%E3%82%8B%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%0A--%E4%B8%8B%E8%A8%98%E3%81%AB%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%E3%82%92%E3%81%94%E8%A8%98%E5%85%A5%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84--%0A">
                        カスタマイズのご相談はこちら
                      </LinkButton>
                    </MainDescription>

                    <div className="flex flex-col gap-6">
                      <MainDescription title="文献調査や研究">
                        <div>
                          論文や書籍などの複数の文献をArsTraverseに取り込み生成された知識グラフから、登場人物、作品、概念、団体などの複雑な関係性を効率的に把握できます。特定のキーワードや関連性で絞り込みながら情報を探索することで、研究テーマの深掘りや新しい発見につながります。
                        </div>
                      </MainDescription>

                      <MainDescription title="デジタルアーカイブプロジェクト">
                        <div>
                          特定の芸術運動、作家、地域文化など、関心のあるトピックについて、他の研究者や学芸員と共同で知識グラフを作成・編集し、公開できます。個人的な調査では限界のある広範な知識を協力して構造化し、相互的なアーカイブとして残していくことができます。
                        </div>
                      </MainDescription>
                    </div>
                  </div>
                </div>
              </div>
            </SubSection>

            <SubSection>
              <div className="flex flex-col gap-8">
                <h2 className="text-center text-2xl font-bold lg:text-3xl">
                  開発ビジョン
                </h2>

                <MainDescription title="なぜArsTraverseを開発するのか？">
                  <div className="flex flex-col gap-4 text-base">
                    <p>
                      芸術作品に出会ったとき、私たちはその 「見た目」
                      だけでなく、
                      <span className="text-orange-400">
                        作品が生まれた背景や、他の作品、作家、そして社会との関わりを知ることで、より深く理解して楽しむことができます。
                      </span>
                      現代美術のように、コンセプトが重要な作品においては、特にこの
                      「文脈」 の理解が重要です。
                    </p>
                    <p>
                      この複雑な文脈を読み解き、鑑賞者や読者に分かりやすく伝える役割を担っているのが美術館や博物館のキュレーターや研究機関の研究者です。
                      彼らは膨大な文献を調査し、情報を編集し、展覧会や記事、論文として発表することで、特定の作家や芸術動向に新たな価値を見出しています。
                    </p>
                    <p>しかし、その過程にはいくつかの課題があり</p>
                    <div className="px-6 text-orange-400">
                      <ul className="list-disc">
                        <li>
                          文献調査からの関係性整理に多大な労力がかかること
                        </li>
                        <li>
                          情報を効果的に可視化するには、可視化に関する専門知識と技術が必要なこと
                        </li>
                        <li>
                          芸術文化分野ではデジタル化・構造化されたデータが不足していること
                        </li>
                      </ul>
                    </div>
                    <p>
                      などが存在しています。
                      現状では既存のAIツールで情報を抽出できても、その後可視化表現を自由に編集したり、企画者自身の独自の知識や見解をスムーズに反映させたりすることが難しいという点もあります。
                    </p>
                    <p className="font-bold text-orange-400">
                      私たちは、芸術文化の価値づけを行うための文脈がより活発に編集され、鑑賞者や読者に伝えられ、そして未来へアーカイブされていくデジタル環境が必要であると考えています。
                    </p>
                  </div>
                </MainDescription>
                <MainDescription title="ArsTraverseが目指すもの">
                  <div className="flex flex-col gap-4 text-base">
                    <p>
                      ArsTraverseを通じて、文献調査から可視化編集、そして発表までのプロセスを円滑化しつつ、そこで発生するデータを適切に保存し再利用していくことで、
                      芸術文化における文脈の議論とアーカイブを活発化させる環境をつくりたいと考えています。
                    </p>
                    <p>
                      ArsTraverseの最終的なイメージは、まさに
                      <span className="font-bold text-orange-400">
                        芸術文化における 「GitHub*的な双方向アーカイブ」
                        プラットフォーム
                      </span>
                      です。
                      文脈が活発に編集され、共有されることで、これまで見過ごされていた関係性の発見や、新たな視点からの意味づけがされていくことを目指しています。
                      このプロジェクトが、芸術文化そのものに新しい価値をもたらす可能性があると信じています。
                    </p>
                    <p className="text-xs">
                      *
                      GitHubは、ソフトウェア開発のためのソースコードを共同で管理できるシステムです。
                    </p>
                  </div>
                </MainDescription>
                <MainDescription title="開発者">
                  <div className="flex flex-col items-center">
                    <OgpScraper url="https://matsuno.caric.jp" />
                  </div>
                </MainDescription>
              </div>
            </SubSection>
          </div>
        </Section>
      </div>

      <Footer />
    </div>
  );
};

const Section = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <FadeIn>
      <div
        className={`flex w-full flex-col gap-4 px-4 py-8 sm:px-8 sm:py-12 ${className}`}
      >
        {children}
      </div>
    </FadeIn>
  );
};

const SubSection = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <FadeIn>
      <div className={`flex w-full flex-col py-10 ${className}`}>
        {children}
      </div>
    </FadeIn>
  );
};

const MainDescription = ({
  children,
  title,
  developing,
}: {
  children: React.ReactNode;
  title: string;
  developing?: boolean;
}) => {
  return (
    <FadeIn>
      <div className="flex flex-col gap-3">
        <div className="flex flex-row items-center gap-2 sm:justify-center">
          {developing && (
            <div className="flex h-6 min-w-[58px] items-center justify-center rounded-full bg-orange-500 px-2 text-sm text-slate-900">
              開発中
            </div>
          )}
          <h3 className="text-xl font-bold">{title}</h3>
        </div>

        <div className="flex flex-col gap-3 text-sm">{children}</div>
      </div>
    </FadeIn>
  );
};

const LinkButton = ({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) => {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-max flex-row items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-slate-900 duration-200 hover:bg-orange-400"
    >
      {children}
    </Link>
  );
};
