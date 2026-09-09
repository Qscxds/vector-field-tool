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
export const EMBED_HEIGHT_WITH_CONTROLS = 640;
export const EMBED_HEIGHT_WITHOUT_CONTROLS = 520;

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
    notation: {
      heading: string;
      items: string[];
      functionsLead: string;
      constantsLine: string;
      piecewiseLine: string;
      negativePowerLine: string;
    };
    controls: { heading: string; mouseHeading: string; mouse: string[]; touchHeading: string; touch: string[] };
    reading: {
      heading: string;
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
        logistic: { title: "Logistic 方程 dy/dt = y(1−y)", note: "两条常数解，一条稳定、一条不稳定；所有解都被 y = 1 吸引。" },
        damped: { title: "阻尼振子 x'' + 0.5x' + x = 0", note: "二阶方程化为系统后，原点是稳定螺旋点。" },
        exact: { title: "恰当方程 2ty dt + (t² + y²) dy = 0", note: "恰当性检验通过，解曲线是势函数的等值线。" },
        lotka: { title: "Lotka–Volterra 捕食者–猎物系统", note: "一个鞍点和一个线性化只能说「中心或弱螺旋」的平衡点。" },
      },
      canHeading: "它能做什么",
      can: [
        "画一阶方程 dy/dt = g(t, y) 或 M dt + N dy = 0 的斜率场，标出常数解并判断其稳定性。",
        "画平面系统 x' = f(x, y)、y' = g(x, y) 的相图，找出平衡点并按线性化分类。",
        "把二阶方程 x'' = F(x, x') 化为系统来画相图。",
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
      intro: "按顺序读：先是记号约定和操作，然后是结果怎么读、已知限制、嵌入到课程网站的方法，最后是（可选的）连接 Claude。",
      notation: {
        heading: "记号约定",
        items: [
          "一阶方程写成 dy/dt = g(t, y)，或者微分形式 M(t, y) dt + N(t, y) dy = 0；t 是自变量，横轴是 t，纵轴是 y。",
          "平面系统写成 x' = f(x, y)，y' = g(x, y)；横轴是 x，纵轴是 y。",
          "二阶方程写成 x'' = F(x, x')，或者直接写整条方程，例如 x'' + 0.5*x' + x = 0；工具令 y = x' 把它化为系统。",
          "输入的是等号右边的表达式，不要连同「dy/dt =」或「x' =」一起输入。",
          "乘法必须写出来：写 t*y，不能写 ty；幂用 ^，例如 y^2。",
        ],
        functionsLead: "可以使用的函数：",
        constantsLine: "常数：pi 和 e。",
        piecewiseLine: "分段表达式用「条件 ? 值 : 值」，例如 y > 0 ? y : -y。",
        negativePowerLine: "负数的分数次幂在这里没有定义（例如 (-8)^(1/3) 不是 −2）；要取实数分支请写 abs(y)^(2/3) 之类的形式。",
      },
      controls: {
        heading: "操作说明",
        mouseHeading: "鼠标",
        mouse: [
          "滚轮：以指针为中心缩放。",
          "拖动：平移视野。",
          "双击：复位到输入的范围。",
          "悬停：预览通过该点的解曲线（蓝色向前，橙色向后）。",
          "单击：把这条解曲线固定下来。",
        ],
        touchHeading: "触屏",
        touch: [
          "双指捏合：缩放。",
          "单指拖动：平移。",
          "双击：复位。",
          "长按：固定通过该点的解曲线。",
          "轻点：预览通过该点的解曲线。",
        ],
      },
      reading: {
        heading: "结果怎么读",
        markersLead: "图上的标记：",
        markers: [
          "实心绿圆：稳定结点或稳定螺旋点（附近的解趋向它）。",
          "空心红圆：不稳定结点或不稳定螺旋点（附近的解离开它）。",
          "紫色叉：鞍点。",
          "灰色虚线圆加问号：线性化无法判定的平衡点（「中心或弱螺旋」或「非双曲」）。",
          "标记旁的「!」徽章：该点处唯一性可能失效。",
          "一阶方程的常数解画成横线：实线稳定，虚线不稳定，点线半稳定或随 t 变化；定义域边界上的常数解用点划线。",
          "橙色空心圆：微分形式的方向场奇点（M = N = 0，此处方向无定义）。",
          "蓝色曲线向前（t 增大），橙色曲线向后；经过唯一性失效点的曲线画成虚线。恰当方程的紫色曲线是势函数的等值线。",
        ],
        centerNote: "为什么「中心或弱螺旋」从不写成「中心」：线性化只给出一对纯虚特征值，真正的中心和极缓慢的螺旋在线性化下无法区分，判定需要守恒量或更高阶的非线性分析，工具不替你猜。",
        formsLead: "方程类型给出三档结论：",
        forms: [
          "「在数值上表现得像……」：在采样点上的相对偏差低于阈值。",
          "「临界情况」：偏差落在阈值附近，可能只是舍入误差，也可能真的不是该形式。",
          "「未通过检验」和「无法检验」：分别列出偏差最大的形式，以及采样点太少无法测试的形式。",
        ],
        notProof: "每一档都附上测得的偏差和阈值。数值证据不是证明：它只说明「在这些采样点上一致」。",
        uniqueness: "唯一性：在某个常数解或平衡点处，如果差商随着靠近而无界增长，工具会说 Lipschitz 条件失效、唯一性没有保证；「有界」的结果不会写成一句话，因为在测试尺度上有界并不能证明 Lipschitz 条件。",
        snapshot: "非自治系统（右端含 t）：图上画的是某一时刻 t 的快照，不给平衡点和稳定性分类；悬停和点击得到的解曲线从快照时刻出发。",
        domainEdge: "定义域边界上的常数解（例如 dy/dt = sqrt(y) 的 y = 0）：向量场只在一侧有定义，那里没有线性化，工具只描述有定义一侧解的走向。",
        truncated: "平衡点或奇点太多时列表会截断，并注明只列出前几个；是否构成连续平衡点集是按全部找到的点判断的。",
        scan: "结果上方有一行说明它是按哪个范围计算的（复位时是输入范围，缩放或平移后是可见范围）：结论依赖于所考察的范围和扫描分辨率，范围外的东西没有被扫描。",
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
        heights: "高度：带表单约 640 像素，不带表单约 520 像素；宽度用 100%。",
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
      helpDescription: "记号约定、操作说明、结果怎么读、已知限制、嵌入到课程网站、连接 Claude。",
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
        logistic: { title: "Logistic equation dy/dt = y(1−y)", note: "Two constant solutions, one stable and one unstable; every solution is attracted to y = 1." },
        damped: { title: "Damped oscillator x'' + 0.5x' + x = 0", note: "Reduced to a system, the origin is a stable spiral point." },
        exact: { title: "Exact equation 2ty dt + (t² + y²) dy = 0", note: "The exactness test passes and the solution curves are level curves of a potential." },
        lotka: { title: "Lotka–Volterra predator–prey system", note: "A saddle and an equilibrium the linearization can only call a center or a weak spiral." },
      },
      canHeading: "What it can do",
      can: [
        "Draw the slope field of a first-order equation dy/dt = g(t, y) or M dt + N dy = 0, mark the constant solutions and judge their stability.",
        "Draw the phase portrait of a planar system x' = f(x, y), y' = g(x, y), find the equilibria and classify them by linearization.",
        "Reduce a second-order equation x'' = F(x, x') to a system and draw its phase portrait.",
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
      intro: "Read in order: notation and controls first, then how to read the results, the known limits, how to embed the tool in a course site, and finally the (optional) Claude connection.",
      notation: {
        heading: "Notation",
        items: [
          "A first-order equation is written dy/dt = g(t, y), or in differential form M(t, y) dt + N(t, y) dy = 0; t is the independent variable, the horizontal axis is t and the vertical axis is y.",
          "A planar system is written x' = f(x, y), y' = g(x, y); the horizontal axis is x and the vertical axis is y.",
          "A second-order equation is written x'' = F(x, x'), or as a full equation such as x'' + 0.5*x' + x = 0; the tool sets y = x' and reduces it to a system.",
          "Enter only the right-hand side of the equation, never the \"dy/dt =\" or \"x' =\" part.",
          "Multiplication must be written out: t*y, not ty; powers use ^, for example y^2.",
        ],
        functionsLead: "Functions you may use:",
        constantsLine: "Constants: pi and e.",
        piecewiseLine: "Piecewise expressions use \"condition ? value : value\", for example y > 0 ? y : -y.",
        negativePowerLine: "A fractional power of a negative number is undefined here (for example (-8)^(1/3) is not −2); for the real branch write abs(y)^(2/3) or a similar form.",
      },
      controls: {
        heading: "Controls",
        mouseHeading: "Mouse",
        mouse: [
          "Wheel: zoom around the pointer.",
          "Drag: pan the view.",
          "Double-click: reset to the entered range.",
          "Hover: preview the solution curve through that point (blue forward, orange backward).",
          "Click: keep that solution curve.",
        ],
        touchHeading: "Touch",
        touch: [
          "Pinch with two fingers: zoom.",
          "Drag with one finger: pan.",
          "Double-tap: reset.",
          "Long-press: keep the solution curve through that point.",
          "Tap: preview the solution curve through that point.",
        ],
      },
      reading: {
        heading: "How to read the results",
        markersLead: "Markers on the picture:",
        markers: [
          "Filled green disc: a stable node or stable spiral (nearby solutions approach it).",
          "Hollow red circle: an unstable node or unstable spiral (nearby solutions leave it).",
          "Violet cross: a saddle.",
          "Gray dashed circle with a question mark: an equilibrium the linearization cannot decide (\"center or weak spiral\" or \"non-hyperbolic\").",
          "A \"!\" badge beside a marker: uniqueness may fail at that point.",
          "Constant solutions of a first-order equation are horizontal lines: solid stable, dashed unstable, dotted semi-stable or varying with t; a constant solution on the domain edge uses a dash-dot pattern.",
          "Hollow orange circle: a singular point of the direction field in differential form (M = N = 0, direction undefined there).",
          "Blue curves run forward (t increasing), orange curves backward; a curve through a point where uniqueness fails is dashed. The violet curves of an exact equation are level curves of the potential.",
        ],
        centerNote: "Why \"center or weak spiral\" never says \"center\": the linearization only gives a purely imaginary pair of eigenvalues, and a true center cannot be told from an extremely slow spiral by linearization; deciding needs a conserved quantity or a higher-order nonlinear analysis, and the tool does not guess for you.",
        formsLead: "Equation types come in three tiers:",
        forms: [
          "\"Numerically behaves like ...\": the relative deviation at the sampled points is below the threshold.",
          "\"Borderline\": the deviation lies near the threshold; this may be rounding, or the equation may not be of this form.",
          "\"Failed the test\" and \"could not be tested\": the forms with the largest deviation, and the forms with too few usable sample points.",
        ],
        notProof: "Every tier carries the measured deviation and the threshold. Numerical evidence is not a proof: it only says that the equation is consistent at those sample points.",
        uniqueness: "Uniqueness: at a constant solution or an equilibrium where the difference quotients grow without bound as the point is approached, the tool says that the Lipschitz condition fails and uniqueness is not guaranteed; a \"bounded\" result is never turned into a sentence, because bounded at the tested scales does not prove the Lipschitz condition.",
        snapshot: "Non-autonomous systems (t on the right-hand side): the picture is a snapshot at one time t, and no equilibria or stability classification are given; the solution curves you get by hovering and clicking start at the snapshot time.",
        domainEdge: "A constant solution on the domain edge (for example y = 0 of dy/dt = sqrt(y)): the field is defined on one side only, there is no linearization there, and the tool only describes the behavior of the solutions on the side where the field is defined.",
        truncated: "When there are too many equilibria or singular points the list is truncated and says that only the first few are listed; whether they form a continuum is judged from all the points found.",
        scan: "A line above the results says which range they were computed for (the entered range at the home view, the visible range after zooming or panning): conclusions depend on the range examined and on the scan resolution, and nothing outside that range was scanned.",
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
        heights: "Height: about 640 px with the form, about 520 px without; use 100% for the width.",
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
      helpDescription: "Notation, controls, how to read the results, known limits, embedding in a course site, connecting Claude.",
      embedTitle: "Embedded page",
      ogAlt: "Vector Field Tool: a slope field picture and the site name.",
    },
  },
};

export function siteText(locale: Locale): SiteText {
  return SITE_TEXT[locale] ?? SITE_TEXT.en;
}

/** "中文 / English" one-liners for metadata, where a single string must serve both languages. */
export function bilingual(key: keyof SiteText["meta"]): string {
  return `${SITE_TEXT.zh.meta[key]} / ${SITE_TEXT.en.meta[key]}`;
}

export const SITE_NAME_BILINGUAL = `${SITE_TEXT.zh.site.name} / ${SITE_TEXT.en.site.name}`;
