/**
 * ALL copy of the site pages (home, help, metadata) in both languages with an identical key
 * structure (tested in site-text.test.ts). Application labels (the form, the results, the
 * widget) live in lib/labels.ts; this file only carries the pages around the application.
 * Lists are string arrays so both languages must have the same number of items.
 */
import { ALLOWED_FUNCTIONS } from "@/lib/core/parse";
import type { Locale } from "@/lib/labels";

/** Public origin the copyable snippets point at (the deployed domain, never a preview URL). */
export const SITE_ORIGIN = "https://tools.studycase.net";
export const EMBED_PATH = "/embed";
export const MCP_ENDPOINT = `${SITE_ORIGIN}/mcp`;
export const GITHUB_URL = "https://github.com/Qscxds/vector-field-tool";
/** The example every snippet embeds: the logistic equation, the first picture of the course. */
export const EMBED_EXAMPLE_QUERY = "m=first&g=y*(1-y)&tmin=0&tmax=10&ymin=-0.5&ymax=1.5";
/**
 * Measured on the real /embed page for the logistic example (document height, results included):
 * with the form 1267 px at a 960 px wide frame (two columns; below 800 px the form stacks above the
 * picture and the page needs about 1820 px), without the form 1243 px at 733 px and 1219 px at
 * 960 px. Rounded up to 20 px. A shorter frame scrolls inside and hides the results.
 */
export const EMBED_HEIGHT_WITH_CONTROLS = 1280;
export const EMBED_HEIGHT_WITHOUT_CONTROLS = 1260;

/** The iframe snippet shown on the help page; `controls: false` is the read-only variant. */
export function embedSnippet(locale: Locale, controls = true): string {
  const query = `${EMBED_EXAMPLE_QUERY}&loc=${locale}${controls ? "" : "&controls=0"}`;
  const height = controls ? EMBED_HEIGHT_WITH_CONTROLS : EMBED_HEIGHT_WITHOUT_CONTROLS;
  return `<iframe src="${SITE_ORIGIN}${EMBED_PATH}?${query}" width="100%" height="${height}" style="border:0" loading="lazy" allow="fullscreen"></iframe>`;
}

/** The function names students may use, straight from the parser whitelist (never retyped). */
export function helpFunctionNames(): string[] {
  return [...ALLOWED_FUNCTIONS.keys()];
}

/** The four example cards of the home page: card key -> preset id (app/vector-field/presets.ts). */
export const HOME_EXAMPLE_PRESET_IDS: Record<"logistic" | "damped" | "exact" | "lotka", string> = {
  logistic: "logistic",
  damped: "damped2",
  exact: "exact",
  lotka: "lotka",
};

/** Appends the page language to an application link so the app opens in the same language. */
export function withLocale(url: string, locale: Locale): string {
  return `${url}${url.includes("?") ? "&" : "?"}loc=${locale}`;
}

export type SiteText = {
  site: Record<
    | "name" | "tagline" | "description" | "languageLabel" | "langZh" | "langEn" | "home" | "help" | "github"
    | "noTracking" | "copy" | "copied" | "copyFallback" | "openApp",
    string
  >;
  home: {
    lead: string;
    open: string;
    examplesHeading: string;
    examples: Record<"logistic" | "damped" | "exact" | "lotka", { title: string; note: string }>;
    canHeading: string;
    can: string[];
    limitsHeading: string;
    limits: string[];
    claudeLine: string;
    claudeLink: string;
  };
  help: {
    title: string;
    intro: string;
    controls: {
      heading: string;
      formHeading: string;
      form: string[];
      mouseHeading: string;
      mouse: string[];
      touchHeading: string;
      touch: string[];
    };
    notation: {
      heading: string;
      items: string[];
      firstOrderLine: string;
      secondOrderLine: string;
      functionsLead: string;
      constantsLine: string;
      piecewiseLine: string;
      negativePowerLine: string;
    };
    reading: {
      heading: string;
      rangeLine: string;
      detailsLine: string;
      equilibriumLine: string;
      markersLead: string;
      markers: string[];
      centerNote: string;
      formsLead: string;
      forms: string[];
      notProof: string;
      uniqueness: string;
      snapshot: string;
      domainEdge: string;
      truncated: string;
      scan: string;
    };
    limits: { heading: string; items: string[] };
    embed: {
      heading: string;
      lead: string;
      withControls: string;
      withoutControls: string;
      sitesHeading: string;
      sites: string[];
      heights: string;
      publicNote: string;
    };
    claude: { heading: string; optional: string; endpointLead: string; steps: string[]; widgetNote: string };
  };
  meta: Record<"homeTitle" | "homeDescription" | "appTitle" | "appDescription" | "helpTitle" | "helpDescription" | "embedTitle" | "ogAlt", string>;
};

export const SITE_TEXT: Record<Locale, SiteText> = {
  zh: {
    site: {
      name: "向量场教学工具",
      tagline: "微分方程课的斜率场、相图与平衡点",
      description: "面向微分方程课程的向量场教学工具：斜率场、相图、平衡点与稳定性、方程类型检测、数值解。",
      languageLabel: "语言",
      langZh: "中文",
      langEn: "English",
      home: "首页",
      help: "使用说明",
      github: "GitHub 源代码",
      noTracking: "本站不使用 cookie、不做任何追踪。",
      copy: "复制",
      copied: "已复制。",
      copyFallback: "浏览器不允许自动复制，请手动选中下面的文本复制。",
      openApp: "打开交互页面",
    },
    home: {
      lead: "这是一个给微分方程课用的交互工具：画斜率场和相图，找平衡点并判断稳定性，用数值方法探测方程类型，并画出数值解曲线。",
      open: "打开交互页面 →",
      examplesHeading: "例子",
      examples: {
        logistic: { title: "Logistic 方程 dy/dt = y(1−y)", note: "两条常数解，一条稳定、一条不稳定；y(0) > 0 的解都趋向 y = 1（从 0 以下出发的解向下发散）。" },
        damped: { title: "阻尼振子 x'' + 0.5x' + x = 0", note: "二阶方程化为系统后，原点是稳定螺旋点。" },
        exact: { title: "恰当方程 2ty dt + (t² + y²) dy = 0", note: "恰当性检验通过，解曲线是势函数的等值线。" },
        lotka: { title: "Lotka–Volterra 捕食者–猎物系统", note: "一个鞍点和一个线性化只能说「中心或弱螺旋」的平衡点。" },
      },
      canHeading: "它能做什么",
      can: [
        "画一阶方程 dy/dt = g(t, y) 或 M dt + N dy = 0 的斜率场，标出常数解并判断其稳定性。",
        "画平面系统 x' = f(x, y)、y' = g(x, y) 的相图，找出平衡点并按线性化分类。",
        "把二阶方程 x'' = F(t, x, x') 化为系统来画相平面（横轴 x，纵轴 x'）。",
        "用数值探测判断一阶方程与哪些教材类型（可分离、线性、恰当、Bernoulli、齐次……）一致，并给出偏差。",
        "悬停预览、点击固定通过任意一点的数值解曲线；滚轮缩放、拖动平移。",
        "每张图都有一个可分享的链接，也可以嵌入到课程网站里。",
      ],
      limitsHeading: "它的限制",
      limits: [
        "只处理平面（二维）问题：一阶方程和二维系统；三维及以上不支持。",
        "全部是数值计算，不做符号运算：它不会给出封闭形式的解。",
        "方程类型是数值探测，不是证明：结果只表示「在采样点上与该形式一致」。",
      ],
      claudeLine: "这个工具也可以接到 Claude 上，让 Claude 用它计算而不是猜测；做法见",
      claudeLink: "使用说明的最后一节",
    },
    help: {
      title: "使用说明",
      intro: "三节：操作（页面上的每个控件和手势）、记号（怎么写方程）、怎么读结果（图上的标记和每一行结论）；后面是已知限制、嵌入到课程网站的方法，以及可选的 Claude 连接。",
      controls: {
        heading: "操作",
        formHeading: "左侧表单",
        form: [
          "预设：按章节分组的例子；选中后方程、范围和固定的轨线一起载入，预设的说明显示成一行，点旁边的 ⓘ 看全文。",
          "类型：二维系统 x' = f, y' = g；一阶方程 dy/dt = g(t, y)；一阶方程 M dt + N dy = 0；二阶方程 x'' = F(t, x, x')。切换类型会换成对应的输入框。",
          "范围：横轴（x 或 t）和 y 的输入范围。平衡点、常数解和方程类型都在这个范围内扫描。",
          "网格密度：每个方向上箭头的个数。",
          "箭头：「等长」把每个箭头画成一样长、用颜色表示模长（方向一目了然，快慢看颜色）；「按模长」让箭头长度随模长变化（快的地方箭头长，慢的地方几乎看不见）。",
          "等比：勾选时 x（或 t）与 y 每单位的像素相同，图上的角度就是真实斜率，为此显示范围会向一个方向扩大以填满画布；取消勾选时输入范围正好填满画布，两个方向比例不同，图上会一直显示「横纵比例不同」的提醒。图下方那一行给出实际显示范围，并注明「等比」或「填满」。",
          "快照时刻 t：只在方程右端含 t（非自治）时出现，图画的是这一时刻的向量场。",
          "清除轨线：删掉所有固定下来的解曲线。",
          "复制链接：当前方程、范围、语言、视图选项和固定轨线的起点都编在链接里，打开链接就是同一张图。",
          "下载 PNG：把当前画面存成两倍分辨率的图片，底部一行写明方程和范围。",
        ],
        mouseHeading: "鼠标",
        mouse: [
          "悬停：预览通过该点的解曲线（预览用一种青色画双向；固定后才分为蓝色向前、橙色向后）。",
          "单击：把这条解曲线固定下来。",
          "滚轮：以指针为中心缩放。",
          "拖动：平移视野。",
          "双击：复位到输入的范围。",
        ],
        touchHeading: "触屏",
        touch: [
          "轻点：预览通过该点的解曲线。",
          "长按：固定通过该点的解曲线。",
          "双指捏合：缩放。",
          "单指拖动：平移。",
          "双击：复位。",
        ],
      },
      notation: {
        heading: "记号",
        items: [
          "一阶方程写成 dy/dt = g(t, y)，或者微分形式 M(t, y) dt + N(t, y) dy = 0；t 是自变量，横轴是 t，纵轴是 y。",
          "平面系统写成 x' = f(x, y)，y' = g(x, y)；横轴是 x，纵轴是 y。",
          "二阶方程写成 x'' = F(t, x, x')，或者直接写整条方程，例如 x'' + 0.5*x' + x = 0；t 是自变量，未知函数是 x(t)。工具令 v = x' 把它化为系统 x' = v，v' = F(t, x, v)，横轴是 x（位置），纵轴是 x'（速度）；这个问题里没有 y。",
          "输入的是等号右边的表达式，不要连同「dy/dt =」或「x' =」一起输入。",
          "乘法必须写出来：写 t*y，不能写 ty；幂用 ^，例如 y^2。",
        ],
        firstOrderLine: "一阶方程里只有 t 和 y 两个变量，写 x 会被拒绝（提示会请你把 x 写成 t）。",
        secondOrderLine: "二阶方程里未知函数是 x，t 是时间；导数用直引号写成 x' 和 x''。x'' 必须线性出现（x''^2、sin(x'') 之类无法降阶），而且它的系数不能为零：这两点是在观察范围和一个固定方块内的若干采样点、若干时刻上数值检验的，只在采样点之外才出现的项（例如只在范围外生效的分段项）检查不到。",
        functionsLead: "可以使用的函数：",
        constantsLine: "常数：pi 和 e。",
        piecewiseLine: "分段表达式用「条件 ? 值 : 值」，例如 y > 0 ? y : -y。",
        negativePowerLine: "负数的分数次幂在这里没有定义（例如 (-8)^(1/3) 不是 −2）；要取实数分支请写 abs(y)^(2/3) 之类的形式。",
      },
      reading: {
        heading: "怎么读结果",
        rangeLine: "结果上方的「以下结果按 … 计算」给出扫描的范围：复位时是输入范围，缩放或平移后是可见范围。平衡点、常数解和方程类型只在这个范围内扫描，结论依赖于所考察的范围和扫描分辨率，范围外的东西没有被扫描。",
        detailsLine: "每一行结论都尽量短，但本身就是诚实的，例如「中心或弱螺旋（线性化无法区分）」。行末的 ⓘ 展开完整的说明：注意事项、唯一性、定义域边界、测得的偏差。折叠只影响页面显示，Claude 读到的工具结果里这些句子一字不少。",
        equilibriumLine: "平衡点每行是：坐标、线性化分类、特征值 λ（共轭复根写成 a ± bi）、雅可比矩阵的迹 tr 和行列式 det。",
        markersLead: "图上的标记：",
        markers: [
          "实心绿圆：稳定结点、稳定螺旋点或稳定的星形 / 退化（非正常）结点（附近的解趋向它）。",
          "空心红圆：不稳定结点、不稳定螺旋点或不稳定的星形 / 退化（非正常）结点（附近的解离开它）。",
          "紫色叉：鞍点。",
          "灰色虚线圆加问号：线性化无法判定的平衡点（「中心或弱螺旋」或「非双曲」）。",
          "标记旁的「!」徽章：该点处唯一性可能失效。",
          "一阶方程的常数解画成横线：实线稳定，虚线不稳定，点线半稳定或随 t 变化；定义域边界上的常数解用点划线。",
          "橙色空心圆加中心小点：微分形式的方向场奇点（M = N = 0，此处方向无定义）。",
          "蓝色曲线向前（t 增大），橙色曲线向后；经过唯一性失效点的曲线画成虚线。恰当方程的紫色曲线是势函数的等值线。",
          "灰色小圆环：向量场在该采样点无定义或无穷大。",
        ],
        centerNote: "为什么「中心或弱螺旋」从不写成「中心」：线性化只给出一对纯虚特征值，真正的中心和极缓慢的螺旋在线性化下无法区分，判定需要守恒量或更高阶的非线性分析，工具不替你猜。",
        formsLead: "方程类型给出三档结论：",
        forms: [
          "「在数值上表现得像……」：在采样点上的相对偏差低于阈值。",
          "「临界情况」：偏差落在阈值附近，可能只是舍入误差，也可能真的不是该形式。",
          "「未通过检验」和「无法检验」：前者逐一列出每个未通过的形式及其各自的最大相对偏差（按定义排除的形式单独一行，附排除原因），后者列出采样点太少无法测试的形式。",
        ],
        notProof: "每一档的测得偏差和阈值都在 ⓘ 里。数值证据不是证明：它只说明「在这些采样点上一致」。",
        uniqueness: "唯一性：在某个常数解或平衡点处，如果差商随着靠近而无界增长，工具会说 Lipschitz 条件失效、唯一性没有保证；「有界」的结果不会写成一句话，因为在测试尺度上有界并不能证明 Lipschitz 条件。",
        snapshot: "非自治系统（右端含 t）：图上画的是某一时刻 t 的快照，不给平衡点和稳定性分类；悬停和点击得到的解曲线从快照时刻出发。",
        domainEdge: "定义域边界上的常数解（例如 dy/dt = sqrt(y) 的 y = 0）：向量场只在一侧有定义，那里没有线性化，工具只描述有定义一侧解的走向。",
        truncated: "平衡点或奇点太多时列表会截断，并注明只列出前几个；是否构成连续平衡点集是按全部找到的点判断的。",
        scan: "「最近一条轨线」说明每条固定曲线在哪里停下（到达指定时间、离开观察范围、趋近平衡点、发散、遇到奇点或定义域边界）。",
      },
      limits: {
        heading: "已知限制",
        items: [
          "只处理平面问题：一阶方程和二维系统。",
          "非自治系统只显示快照，不做稳定性分类。",
          "数值方法不给出符号解；解曲线是数值积分的结果。",
          "方程类型检测基于采样，采样点之外的行为没有被检验。",
          "「在测试尺度上有界」不是 Lipschitz 条件的证明。",
          "二阶方程化为系统的正确性只在采样点上做了数值核对。",
        ],
      },
      embed: {
        heading: "嵌入说明",
        lead: "任何网页都可以用 iframe 嵌入 /embed 页面，参数和分享链接完全一样。下面是 Logistic 方程的例子：",
        withControls: "带输入表单：",
        withoutControls: "只读版本（controls=0，隐藏表单，仍显示方程和结果）：",
        sitesHeading: "Google Sites 里的步骤",
        sites: [
          "打开页面编辑，点「插入」。",
          "选「嵌入」，再选「嵌入代码」。",
          "粘贴上面的代码，点「插入」。",
          "发布网站。",
        ],
        heights: `高度：带表单约 ${EMBED_HEIGHT_WITH_CONTROLS} 像素（框宽不足 800 像素时表单会叠在图上方，约需 1820 像素），不带表单约 ${EMBED_HEIGHT_WITHOUT_CONTROLS} 像素；图下方的结果需要这个高度，框太矮时结果只能在框内滚动。宽度用 100%。`,
        publicNote: "被嵌入的页面必须是公开的（不需要登录才能看到），否则学生看不到。",
      },
      claude: {
        heading: "连接 Claude（可选）",
        optional: "这一步不是必需的：网页本身就能完成全部教学功能。连接之后，Claude 会调用同一套计算内核来回答问题，而不是自己猜数字。",
        endpointLead: "MCP 端点：",
        steps: [
          "打开 Claude 的设置，进入「Connectors」（连接器）。",
          "点「Add custom connector」（添加自定义连接器）。",
          "粘贴上面的端点地址，认证选「None」（无），保存。",
          "在对话里让 Claude 分析一个方程或系统。",
        ],
        widgetNote: "回答会以交互式小部件的形式显示在对话里，可以缩放、悬停和点击。",
      },
    },
    meta: {
      homeTitle: "首页",
      homeDescription: "微分方程课的向量场教学工具：斜率场、相图、平衡点与稳定性、方程类型检测、数值解。",
      appTitle: "交互页面",
      appDescription: "输入一阶方程或平面系统，看斜率场、相图、平衡点和数值解曲线。",
      helpTitle: "使用说明",
      helpDescription: "操作、记号、怎么读结果、已知限制、嵌入到课程网站、连接 Claude。",
      embedTitle: "嵌入页面",
      ogAlt: "向量场教学工具：一张斜率场图和站点名称。",
    },
  },
  en: {
    site: {
      name: "Vector Field Tool",
      tagline: "Slope fields, phase portraits and equilibria for a differential-equations course",
      description: "A vector field teaching tool for differential-equations courses: slope fields, phase portraits, equilibria and stability, equation-type detection, numerical solutions.",
      languageLabel: "Language",
      langZh: "中文",
      langEn: "English",
      home: "Home",
      help: "Help",
      github: "Source on GitHub",
      noTracking: "This site uses no cookies and does no tracking.",
      copy: "Copy",
      copied: "Copied.",
      copyFallback: "The browser did not allow automatic copying; select the text below and copy it by hand.",
      openApp: "Open the interactive page",
    },
    home: {
      lead: "An interactive tool for a differential-equations course: draw slope fields and phase portraits, find equilibria and judge their stability, probe the equation type numerically, and plot numerical solution curves.",
      open: "Open the interactive page →",
      examplesHeading: "Examples",
      examples: {
        logistic: { title: "Logistic equation dy/dt = y(1−y)", note: "Two constant solutions, one stable and one unstable; solutions with y(0) > 0 approach y = 1 (solutions starting below 0 diverge downward)." },
        damped: { title: "Damped oscillator x'' + 0.5x' + x = 0", note: "Reduced to a system, the origin is a stable spiral point." },
        exact: { title: "Exact equation 2ty dt + (t² + y²) dy = 0", note: "The exactness test passes and the solution curves are level curves of a potential." },
        lotka: { title: "Lotka–Volterra predator–prey system", note: "A saddle and an equilibrium the linearization can only call a center or a weak spiral." },
      },
      canHeading: "What it can do",
      can: [
        "Draw the slope field of a first-order equation dy/dt = g(t, y) or M dt + N dy = 0, mark the constant solutions and judge their stability.",
        "Draw the phase portrait of a planar system x' = f(x, y), y' = g(x, y), find the equilibria and classify them by linearization.",
        "Reduce a second-order equation x'' = F(t, x, x') to a system and draw its phase plane (x horizontally, x' vertically).",
        "Probe numerically which textbook types (separable, linear, exact, Bernoulli, homogeneous, ...) a first-order equation is consistent with, and report the deviation.",
        "Hover to preview and click to keep the numerical solution curve through any point; wheel to zoom, drag to pan.",
        "Every picture has a shareable link and can be embedded in a course website.",
      ],
      limitsHeading: "Its limits",
      limits: [
        "Planar (two-dimensional) problems only: first-order equations and planar systems; three or more dimensions are not supported.",
        "Everything is numerical, nothing is symbolic: it never gives a closed-form solution.",
        "Equation types are numerical probes, not proofs: a result only says that the equation is consistent with that form at the sampled points.",
      ],
      claudeLine: "The tool can also be connected to Claude so that Claude computes with it instead of guessing; see",
      claudeLink: "the last section of the help page",
    },
    help: {
      title: "Help",
      intro: "Three sections: Controls (every control and gesture on the page), Notation (how to write an equation) and Reading the results (the markers on the picture and each line of conclusions); then the known limits, how to embed the tool in a course site, and the optional Claude connection.",
      controls: {
        heading: "Controls",
        formHeading: "The form on the left",
        form: [
          "Presets: worked examples grouped by chapter. Choosing one loads the equation, the range and any fixed trajectories; the preset's note is shown on one line, and the ⓘ next to it opens the full text.",
          "Type: a planar system x' = f, y' = g; a first-order equation dy/dt = g(t, y); a first-order equation M dt + N dy = 0; or a second-order equation x'' = F(t, x, x'). Switching the type switches the input fields.",
          "Range: the entered range of the horizontal coordinate (x or t) and of y. Equilibria, constant solutions and equation types are scanned inside it.",
          "Grid density: the number of arrows in each direction.",
          "Arrows: Uniform draws every arrow at the same length and encodes the magnitude in the color (the direction is easy to read, the speed is in the color); Scaled makes the length follow the magnitude (long where the field is fast, almost invisible where it is slow).",
          "Equal scale: when checked, x (or t) and y have the same pixels per unit, so an angle in the picture is a true slope; to achieve that the displayed range is widened in one direction to fill the canvas. Unchecked, the entered range fills the canvas exactly, the two directions are scaled differently, and a persistent warning says that the axes are not to the same scale. The line under the picture gives the displayed range with \"(equal scale)\" or \"(filled)\".",
          "Snapshot time t: shown only when the right-hand side contains t (a non-autonomous equation); the picture is the field at that instant.",
          "Clear trajectories: removes every kept solution curve.",
          "Copy link: the equation, the range, the language, the view options and the starting points of the kept trajectories are all encoded in the link; opening it shows the same picture.",
          "Download PNG: saves the current picture at twice the resolution, with one footer line naming the equation and the range.",
        ],
        mouseHeading: "Mouse",
        mouse: [
          "Hover: preview the solution curve through that point (the preview is drawn in one teal color both ways; only a kept curve splits into blue forward, orange backward).",
          "Click: keep that solution curve.",
          "Wheel: zoom around the pointer.",
          "Drag: pan the view.",
          "Double-click: reset to the entered range.",
        ],
        touchHeading: "Touch",
        touch: [
          "Tap: preview the solution curve through that point.",
          "Long-press: keep the solution curve through that point.",
          "Pinch with two fingers: zoom.",
          "Drag with one finger: pan.",
          "Double-tap: reset.",
        ],
      },
      notation: {
        heading: "Notation",
        items: [
          "A first-order equation is written dy/dt = g(t, y), or in differential form M(t, y) dt + N(t, y) dy = 0; t is the independent variable, the horizontal axis is t and the vertical axis is y.",
          "A planar system is written x' = f(x, y), y' = g(x, y); the horizontal axis is x and the vertical axis is y.",
          "A second-order equation is written x'' = F(t, x, x'), or as a full equation such as x'' + 0.5*x' + x = 0; t is the independent variable and the unknown is x(t). The tool sets v = x' and reduces it to the system x' = v, v' = F(t, x, v), with x (position) on the horizontal axis and x' (velocity) on the vertical axis; there is no y in this problem.",
          "Enter only the right-hand side of the equation, never the \"dy/dt =\" or \"x' =\" part.",
          "Multiplication must be written out: t*y, not ty; powers use ^, for example y^2.",
        ],
        firstOrderLine: "A first-order equation has only the two variables t and y; x is rejected (the message asks you to write t instead).",
        secondOrderLine: "In a second-order equation the unknown is x and t is the time; write the derivatives as x' and x'' with straight apostrophes. x'' must appear linearly (x''^2, sin(x'') and the like cannot be reduced) and its coefficient must never vanish; both are checked numerically at sample points spread over the viewing box and a fixed square, at several times, so a term that is only active away from every sample point (a piecewise branch outside the box) cannot be detected.",
        functionsLead: "Functions you may use:",
        constantsLine: "Constants: pi and e.",
        piecewiseLine: "Piecewise expressions use \"condition ? value : value\", for example y > 0 ? y : -y.",
        negativePowerLine: "A fractional power of a negative number is undefined here (for example (-8)^(1/3) is not −2); for the real branch write abs(y)^(2/3) or a similar form.",
      },
      reading: {
        heading: "Reading the results",
        rangeLine: "The line \"Results for ...\" above the results names the range that was scanned: the entered range at the home view, the visible range after zooming or panning. Equilibria, constant solutions and equation types are scanned inside that range only; conclusions depend on the range examined and on the scan resolution, and nothing outside it was scanned.",
        detailsLine: "Each line of conclusions is kept short but is honest on its own, for example \"center or weak spiral (linearization cannot tell)\". The ⓘ at the end of a line opens the full explanation: the caveat, uniqueness, the domain edge, the measured deviation. Folding affects the page only; the tool results Claude reads carry every sentence in full.",
        equilibriumLine: "An equilibrium line reads: the point, its classification by linearization, the eigenvalues λ (a complex-conjugate pair is written a ± bi), and the trace tr and determinant det of the Jacobian.",
        markersLead: "Markers on the picture:",
        markers: [
          "Filled green disc: a stable node, stable spiral or stable star / degenerate (improper) node (nearby solutions approach it).",
          "Hollow red circle: an unstable node, unstable spiral or unstable star / degenerate (improper) node (nearby solutions leave it).",
          "Violet cross: a saddle.",
          "Gray dashed circle with a question mark: an equilibrium the linearization cannot decide (\"center or weak spiral\" or \"non-hyperbolic\").",
          "A \"!\" badge beside a marker: uniqueness may fail at that point.",
          "Constant solutions of a first-order equation are horizontal lines: solid stable, dashed unstable, dotted semi-stable or varying with t; a constant solution on the domain edge uses a dash-dot pattern.",
          "Hollow orange circle with a center dot: a singular point of the direction field in differential form (M = N = 0, direction undefined there).",
          "Blue curves run forward (t increasing), orange curves backward; a curve through a point where uniqueness fails is dashed. The violet curves of an exact equation are level curves of the potential.",
          "Small gray rings: sample points where the vector field is undefined or infinite.",
        ],
        centerNote: "Why \"center or weak spiral\" never says \"center\": the linearization only gives a purely imaginary pair of eigenvalues, and a true center cannot be told from an extremely slow spiral by linearization; deciding needs a conserved quantity or a higher-order nonlinear analysis, and the tool does not guess for you.",
        formsLead: "Equation types come in three tiers:",
        forms: [
          "\"Numerically behaves like ...\": the relative deviation at the sampled points is below the threshold.",
          "\"Borderline\": the deviation lies near the threshold; this may be rounding, or the equation may not be of this form.",
          "\"Failed the test\" and \"could not be tested\": the first lists every form that failed, each with its own largest relative deviation (a form ruled out by definition gets its own line with the rule instead), the second the forms with too few usable sample points.",
        ],
        notProof: "The measured deviation and the threshold of every tier are behind the ⓘ. Numerical evidence is not a proof: it only says that the equation is consistent at those sample points.",
        uniqueness: "Uniqueness: at a constant solution or an equilibrium where the difference quotients grow without bound as the point is approached, the tool says that the Lipschitz condition fails and uniqueness is not guaranteed; a \"bounded\" result is never turned into a sentence, because bounded at the tested scales does not prove the Lipschitz condition.",
        snapshot: "Non-autonomous systems (t on the right-hand side): the picture is a snapshot at one time t, and no equilibria or stability classification are given; the solution curves you get by hovering and clicking start at the snapshot time.",
        domainEdge: "A constant solution on the domain edge (for example y = 0 of dy/dt = sqrt(y)): the field is defined on one side only, there is no linearization there, and the tool only describes the behavior of the solutions on the side where the field is defined.",
        truncated: "When there are too many equilibria or singular points the list is truncated and says that only the first few are listed; whether they form a continuum is judged from all the points found.",
        scan: "\"Last trajectory\" says where each kept curve stopped (the requested time, the edge of the viewing box, an equilibrium, a blow-up, a singular point or the edge of the domain).",
      },
      limits: {
        heading: "Known limits",
        items: [
          "Planar problems only: first-order equations and planar systems.",
          "Non-autonomous systems show a snapshot and get no stability classification.",
          "Numerical methods give no symbolic solution; the solution curves are numerical integrations.",
          "Type detection is sampling-based; behavior away from the sample points is not tested.",
          "\"Bounded at the tested scales\" is not a proof of the Lipschitz condition.",
          "The second-order reduction is checked numerically at sample points only.",
        ],
      },
      embed: {
        heading: "Embedding",
        lead: "Any web page can embed the /embed page in an iframe; the parameters are exactly those of a share link. Here is the logistic equation:",
        withControls: "With the input form:",
        withoutControls: "Read-only variant (controls=0 hides the form; the equation and the results stay):",
        sitesHeading: "Steps in Google Sites",
        sites: [
          "Open the page editor and click Insert.",
          "Choose Embed, then Embed code.",
          "Paste the code above and click Insert.",
          "Publish the site.",
        ],
        heights: `Height: about ${EMBED_HEIGHT_WITH_CONTROLS} px with the form (below an 800 px frame width the form stacks above the picture and needs about 1820 px), about ${EMBED_HEIGHT_WITHOUT_CONTROLS} px without; the results below the picture need that height, and a shorter frame only scrolls inside. Use 100% for the width.`,
        publicNote: "The embedding page must be public (visible without signing in), or students will not see it.",
      },
      claude: {
        heading: "Connecting Claude (optional)",
        optional: "This step is not required: the web page alone covers everything the course needs. Once connected, Claude calls the same computation kernel to answer questions instead of guessing numbers.",
        endpointLead: "MCP endpoint:",
        steps: [
          "Open Claude's settings and go to Connectors.",
          "Click Add custom connector.",
          "Paste the endpoint above, choose None for authentication, and save.",
          "In a conversation, ask Claude to analyze an equation or a system.",
        ],
        widgetNote: "Answers render as an interactive widget inside the conversation; you can zoom, hover and click in it.",
      },
    },
    meta: {
      homeTitle: "Home",
      homeDescription: "A vector field teaching tool for differential-equations courses: slope fields, phase portraits, equilibria and stability, equation-type detection, numerical solutions.",
      appTitle: "Interactive page",
      appDescription: "Enter a first-order equation or a planar system and see its slope field, phase portrait, equilibria and numerical solution curves.",
      helpTitle: "Help",
      helpDescription: "Controls, notation, reading the results, known limits, embedding in a course site, connecting Claude.",
      embedTitle: "Embedded page",
      ogAlt: "Vector Field Tool: a slope field picture and the site name.",
    },
  },
};

export function siteText(locale: Locale): SiteText {
  return SITE_TEXT[locale] ?? SITE_TEXT.en;
}

/** "English / 中文" one-liners for metadata, where a single string must serve both languages (English first: the site's default). */
export function bilingual(key: keyof SiteText["meta"]): string {
  return `${SITE_TEXT.en.meta[key]} / ${SITE_TEXT.zh.meta[key]}`;
}

export const SITE_NAME_BILINGUAL = `${SITE_TEXT.en.site.name} / ${SITE_TEXT.zh.site.name}`;
