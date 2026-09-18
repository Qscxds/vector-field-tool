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
    /** "What's new" (round S): the heading and the label of an entry's action box; the entries are lib/changelog.ts. */
    newsHeading: string;
    newsActionLabel: string;
    /** The MCP reconnect notice at the head of the Claude paragraph (the same sentence as help.claude.reconnect). */
    mcpReconnect: string;
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
      /** One entry per input mode (round P2.9): its variables, its independent variable, its axes, and the words used for its picture. */
      items: string[];
      firstOrderLine: string;
      secondOrderLine: string;
      /** The three terms that differ by mode (equilibrium point / constant solution / singular point) and the two words for a kept curve. */
      termsLine: string;
      /** What "equal scale" means in each picture. */
      equalScaleLine: string;
      /** The time-series view (round Q): what it draws and why the second-order chapter needs it. */
      timeSeriesLine: string;
      functionsLead: string;
      constantsLine: string;
      /** Round T: symbolic parameters: how to write them, the rows that appear by themselves, the link's p, one set for all modes. */
      paramsLine: string;
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
    claude: {
      heading: string;
      /** Round S: at the head of the section. The widget version changed: remove and re-add the connector, or it silently fails to render. */
      reconnect: string;
      optional: string;
      endpointLead: string;
      steps: string[];
      widgetNote: string;
    };
  };
  meta: Record<"homeTitle" | "homeDescription" | "appTitle" | "appDescription" | "helpTitle" | "helpDescription" | "embedTitle" | "ogAlt", string>;
};

/**
 * The MCP reconnect notice (round S), shown at the head of the Claude paragraph on the home page,
 * at the head of the help page's Claude section and in the change log's action box: the widget
 * version changed, and Claude keeps the widget resource address from when the connector was
 * ADDED, so disconnecting and reconnecting is not enough; the connector must be removed and added
 * again, or the widget silently fails to render.
 */
const MCP_RECONNECT_ZH = `widget 版本已更新：已经添加过连接器的人必须删除连接器再重新添加（只断开重连不够），否则 widget 会静默不渲染。删除后重新添加的端点：${MCP_ENDPOINT}`;
const MCP_RECONNECT_EN = `The widget version has changed: if you added the connector before, you must remove it and add it again (disconnecting and reconnecting is not enough), or the widget silently fails to render. The endpoint to add again: ${MCP_ENDPOINT}`;

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
        logistic: { title: "Logistic 方程 dy/dt = k·y(1 − y/L)", note: "带参数 k = 0.8、L = 2：两条常数解，y = 0 不稳定、y = L 稳定；y(0) > 0 的解都趋向 y = L（从 0 以下出发的解向下发散）。" },
        damped: { title: "阻尼振子 x'' + 2b·x' + w²x = 0", note: "b = 0.25、w = 1 时原点是稳定螺旋点；把 b 调过 w，它变成稳定结点。" },
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
      newsHeading: "更新说明",
      newsActionLabel: "需要你做的：",
      mcpReconnect: MCP_RECONNECT_ZH,
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
          "预设：按章节分组的例子；选中后方程、范围和固定的曲线一起载入，预设的说明显示成一行，点旁边的 ⓘ 看全文。",
          "类型：二维系统 x' = f, y' = g；一阶方程 dy/dt = g(t, y)；一阶方程 M dt + N dy = 0；二阶方程 x'' = F(t, x, x')。切换类型会换成对应的输入框。",
          "范围：横轴（x 或 t）和纵轴（y，二阶方程为 x'）的输入范围。平衡点、常数解和方程类型都在这个范围内扫描。",
          "网格密度：每个方向上箭头的个数。",
          "箭头：「等长」把每个箭头画成一样长、用颜色表示模长（方向一目了然，快慢看颜色）；「按模长」让箭头长度随模长变化（快的地方箭头长，慢的地方几乎看不见）。",
          "等比：勾选时横轴与纵轴每单位的像素相同，图上的角度就是真实的（一阶方程里是斜率 dy/dt，相平面里是箭头和轨线的真实方向），为此显示范围会向一个方向扩大以填满画布；取消勾选时输入范围正好填满画布，两个方向比例不同，图上会一直显示「横纵比例不同」的提醒。图下方那一行给出实际显示范围，并注明「等比」或「填满」。",
          "视图（平面系统和二阶方程）：「相平面」画向量场和轨线；「时间序列」以 t 为横轴画每条固定曲线的 x(t)、y(t)（二阶方程画 x(t)，勾选「同时画 x'(t)」再叠加 x'(t)），带图例；「t 起 / t 止」定横轴范围，纵轴范围取输入范围。默认：自治 → 相平面，非自治（右端含 t）→ 时间序列；链接记住你的选择。时间序列里等比没有意义，自动解除并常驻说明；曲线仍按相平面的规则算到 t₀ 前后各 50 个时间单位，超出的部分空白并有说明；点击图像不添加曲线，请用「初值」添加，「清除」「撤销」照常；查询到的点同样标在曲线上。",
          "快照时刻 t：只在平面系统或二阶方程的右端含 t（非自治）时出现，图画的是这一时刻的向量场；二阶方程里这个输入框叫 t₀，初值 x(t₀)、x'(t₀) 和解曲线都从这一时刻出发。一阶方程 dy/dt = g(t, y) 不需要它：t 就是横轴，画的是整张斜率场。",
          "清除解曲线 / 清除轨线（按钮名随图而变）：删掉所有固定下来的曲线。",
          "复制链接：当前方程、范围、语言、视图选项和固定曲线的起点都编在链接里，打开链接就是同一张图。",
          "下载 PNG：把当前画面存成两倍分辨率的图片，底部一行写明方程和范围。",
          "报告问题：页面底部（嵌入页也有）的「报告问题」打开 GitHub 的新 issue 表单，预填当前链接、浏览器名称和三行提示（做了什么 / 期望 / 实际）；这个工具不收集任何数据，发不发由你。没有 GitHub 账号就把链接和这三行发给老师。",
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
          "一阶方程 dy/dt = g(t, y)：t 是自变量，y 是未知函数；横轴是 t，纵轴是 y。图上画的是解 y(t) 的图像（解曲线）和斜率场；常数解 y = c 是水平线。只输入等号右边的 g(t, y)。",
          "微分形式 M(t, y) dt + N(t, y) dy = 0：同样是一阶方程，t 是自变量，横轴 t、纵轴 y。它没有方向（M dt + N dy = 0 和 −M dt − N dy = 0 是同一个方程），所以方向场画成无向线段，固定的解曲线只有一种颜色。M = N = 0 的点是方向场奇点：那里方向无定义，谈不上稳定性。工具是沿曲线自身的参数走的，这个参数不是 t，所以停止说明只报终点的坐标 (t, y)，不报「积到 t = 多少」。",
          "平面系统 x' = f(x, y)，y' = g(x, y)：t 是时间，x、y 是两个未知函数；横轴 x、纵轴 y，画的是相平面里的轨线（不是 x(t) 或 y(t) 的图像）。平衡点是 f = g = 0 的点，按线性化分类。右端含 t 时系统非自治，图上只是 t 时刻的快照，不做平衡点分析。只输入等号右边。",
          "二阶方程 x'' = F(t, x, x')：t 是自变量，x(t) 是未知函数，x' 可以写成 v。可以写整条方程（x'' + 0.5*x' + x = 0），也可以只写右端 F。工具令 v = x' 把它化为系统 x' = v，v' = F(t, x, v)，画相平面：横轴 x（位置），纵轴 x'（速度）；这个问题里没有 y，写 y 会被拒绝。相平面里的平衡点 (x, x') = (c, 0) 就是常数解 x ≡ c（物体静止）。右端含 t 时方程非自治，图上只是 t₀ 时刻的快照，初值 x(t₀)、x'(t₀) 从这一时刻出发。",
          "乘法必须写出来：写 t*y，不能写 ty；幂用 ^，例如 y^2。",
        ],
        firstOrderLine: "一阶方程里只有 t 和 y 两个变量，写 x 会被拒绝（提示会请你把 x 写成 t）。",
        secondOrderLine: "二阶方程里 x'' 必须线性出现（x''^2、sin(x'') 之类无法降阶），而且它的系数不能为零：这两点是在观察范围内的采样点和原点附近几个固定点上、若干时刻上数值检验的，只在采样点之外才出现的项（例如只在范围外生效的分段项）检查不到。",
        termsLine: "术语按模式区分：平面系统和二阶方程的相平面里说「平衡点」（f = g = 0 的点，有稳定性分类；二阶时它就是常数解 x ≡ c）；一阶方程说「常数解」y = c（它是一个解，不是一个点，稳定性指两侧的解是趋向它还是离开它）；微分形式说「方向场奇点」（M = N = 0，方向无定义，没有稳定性可言）。固定下来的曲线在一阶方程里叫「解曲线」，在相平面里叫「轨线」。",
        equalScaleLine: "「等比」在各模式下的含义：一阶方程里，图上曲线的倾角就是斜率 dy/dt；平面系统里，箭头和轨线的方向是相平面里的真实方向（沿轨线的斜率是 dy/dx，不是随时间的变化率）；二阶方程里同理，沿轨线的斜率是 dx'/dx。",
        timeSeriesLine: "时间序列视图：横轴 t，纵轴是解的值 x(t)、y(t)（二阶方程为 x(t)、x'(t)）。这是受迫振动、拍频、共振一章要看的图：对非自治方程，相平面只是某一时刻的快照，而 x(t) 才显示振幅随时间的起伏。一阶方程的图本来就是 y 对 t 的图，没有这个切换。",
        functionsLead: "可以使用的函数：",
        constantsLine: "常数：pi 和 e。",
        paramsLine: "参数：方程里可以直接写字母参数，例如 k*y*(1 - y/L)、-k*(y - Ta)、x'' + 2*b*x' + w^2*x = 0。除了变量（t、x、y，二阶方程里还有 v）、pi、e 和函数名之外，你写下的每个名字都会自动出现在表达式下面的「参数」区，先取 1 并高亮，请填上你要的值（可以是负数、小数）；名字要以字母开头，乘法仍然要写出来（ky 会被当作一个叫 ky 的参数，k 乘 y 要写 k*y）。四种方程类型共用同一组参数，M 和 N、f 和 g 用的是同一个 k。仍被方程使用的参数删不掉：先把它从方程里去掉。参数的取值会写进链接（例如 &p=k:0.8,L:2），所以「k = 0.8、L = 2 的 logistic」可以作为一个直达链接发给别人；结果区、导出的 PNG 和 Claude 读到的摘要都会写明这张图用的是哪组参数。",
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
          "蓝色曲线向前（t 增大），橙色曲线向后；微分形式 M dt + N dy = 0 的固定曲线只有一种颜色，因为这种形式没有方向。经过唯一性失效点的曲线画成虚线。恰当方程的紫色曲线是势函数的等值线。",
          "灰色小圆环：向量场在该采样点无定义或无穷大。",
          "零斜线（「在图上显示」里打开）：x' = 0 画成青色实线，y' = 0 画成棕色虚线（二阶方程是 x' = 0 与 x'' = 0；一阶方程只有 dy/dt = 0 一族；微分形式是 N = 0 与 M = 0）。两族的交点就是平衡点，所以一眼能看出平衡点为什么在那里；一阶方程里它是解曲线取极大、极小值的位置。",
          "特征方向：在特征值为实数的双曲平衡点处，沿线性化的特征向量画的一小段深色直线。稳定方向是实线、箭头朝里，不稳定方向是虚线、箭头朝外；退化结点只有一条（这正是它的定义特征），特征值是复数（螺旋点、中心或弱螺旋）时没有实的特征方向，不画。点开该平衡点的 ⓘ 可以看到哪条是哪条。",
          "分界线：从每个鞍点沿特征方向出发的四条粗黑曲线（稳定流形实线，逆时间积分；不稳定流形虚线，正时间积分）。它们把相平面分成命运不同的区域：初值在分界线这一侧还是那一侧，解的去向完全不同。它是数值曲线，从离鞍点极近（约一个像素）的一点沿线性化方向出发。",
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
        snapshot: "非自治系统或非自治二阶方程（右端含 t）：图上画的是某一时刻 t 的快照，不给平衡点和稳定性分类；悬停和点击得到的轨线从快照时刻出发。",
        domainEdge: "定义域边界上的常数解（例如 dy/dt = sqrt(y) 的 y = 0）：向量场只在一侧有定义，那里没有线性化，工具只描述有定义一侧解的走向。",
        truncated: "平衡点或奇点太多时列表会截断，并注明只列出前几个；是否构成连续平衡点集是按全部找到的点判断的。",
        scan: "「最近一条解曲线」或「最近一条轨线」说明每条固定曲线在哪里停下（走完了指定的跨度——一阶方程和相平面里是时间 t，微分形式里是曲线自身的参数——、离开观察范围、趋近平衡点、发散、遇到奇点或定义域边界）。",
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
        reconnect: MCP_RECONNECT_ZH,
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
        logistic: { title: "Logistic equation dy/dt = k·y(1 − y/L)", note: "With the parameters k = 0.8, L = 2: two constant solutions, y = 0 unstable and y = L stable; solutions with y(0) > 0 approach y = L (solutions starting below 0 diverge downward)." },
        damped: { title: "Damped oscillator x'' + 2b·x' + w²x = 0", note: "With b = 0.25, w = 1 the origin is a stable spiral point; move b past w and it becomes a stable node." },
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
      newsHeading: "What's new",
      newsActionLabel: "Action required:",
      mcpReconnect: MCP_RECONNECT_EN,
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
          "Presets: worked examples grouped by chapter. Choosing one loads the equation, the range and any fixed curves; the preset's note is shown on one line, and the ⓘ next to it opens the full text.",
          "Type: a planar system x' = f, y' = g; a first-order equation dy/dt = g(t, y); a first-order equation M dt + N dy = 0; or a second-order equation x'' = F(t, x, x'). Switching the type switches the input fields.",
          "Range: the entered range of the horizontal coordinate (x or t) and of the vertical one (y, or x' for a second-order equation). Equilibria, constant solutions and equation types are scanned inside it.",
          "Grid density: the number of arrows in each direction.",
          "Arrows: Uniform draws every arrow at the same length and encodes the magnitude in the color (the direction is easy to read, the speed is in the color); Scaled makes the length follow the magnitude (long where the field is fast, almost invisible where it is slow).",
          "Equal scale: when checked, the horizontal and vertical coordinates have the same pixels per unit, so an angle in the picture is true (the slope dy/dt on a first-order picture, the true direction of arrows and trajectories on a phase plane); to achieve that the displayed range is widened in one direction to fill the canvas. Unchecked, the entered range fills the canvas exactly, the two directions are scaled differently, and a persistent warning says that the axes are not to the same scale. The line under the picture gives the displayed range with \"(equal scale)\" or \"(filled)\".",
          "View (planar systems and second-order equations): Phase plane draws the field and the trajectories; Time series draws, against t, every kept curve's x(t) and y(t) (for a second-order equation x(t), plus x'(t) when \"Also draw x'(t)\" is checked), with a legend; \"t from / t to\" set the horizontal range, the vertical range is the entered range. Default: autonomous → phase plane, non-autonomous (t on the right-hand side) → time series; the link remembers your choice. Equal scale has no meaning in a time series and is switched off with a persistent note; the curves are still computed by the phase plane's rule, 50 time units before and after t₀, and the picture is blank beyond that (a note says so); a click on the picture does not add a curve (use Initial value; Clear and Undo work as usual); the points found by a query are marked on the curves too.",
          "Snapshot time t: shown only for a planar system or a second-order equation whose right-hand side contains t (non-autonomous); the picture is then the field at that instant. For a second-order equation the field is called t₀: the initial values x(t₀), x'(t₀) and the solution curves start at that instant. A first-order equation dy/dt = g(t, y) never needs one: t is its horizontal axis and the whole slope field is drawn.",
          "Clear solution curves / Clear trajectories (the button's name follows the picture): removes every kept curve.",
          "Copy link: the equation, the range, the language, the view options and the starting points of the kept curves are all encoded in the link; opening it shows the same picture.",
          "Download PNG: saves the current picture at twice the resolution, with one footer line naming the equation and the range.",
          "Report a problem: the link at the bottom of the page (and of the embedded page) opens GitHub's new-issue form prefilled with the current link, the browser's name and three prompts (what you did / expected / saw); this tool collects nothing, sending is your decision. Without a GitHub account, send the link and those three lines to your teacher.",
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
          "First-order equation dy/dt = g(t, y): t is the independent variable and y the unknown function; the horizontal axis is t, the vertical axis y. The picture shows the graphs of solutions y(t) (solution curves) and the slope field; a constant solution y = c is a horizontal line. Enter only the right-hand side g(t, y).",
          "Differential form M(t, y) dt + N(t, y) dy = 0: also a first-order equation, t the independent variable, horizontal axis t, vertical axis y. It has no direction (M dt + N dy = 0 and −M dt − N dy = 0 are the same equation), so the direction field is drawn as undirected segments and a kept solution curve is one color. A point where M = N = 0 is a singular point of the direction field: the direction is undefined there, and stability is not a meaningful question. The tool follows the curve by a parameter of its own, which is not t, so a stop is reported by the end point's coordinates (t, y), never as \"reached t = …\".",
          "Planar system x' = f(x, y), y' = g(x, y): t is the time and x, y are two unknown functions; horizontal axis x, vertical axis y, and the picture shows the trajectories of the phase plane (not the graphs of x(t) or y(t)). An equilibrium point is a point where f = g = 0, classified by linearization. If t appears in f or g the system is non-autonomous: the picture is only the snapshot at time t and no equilibrium analysis is made. Enter only the right-hand sides.",
          "Second-order equation x'' = F(t, x, x'): t is the independent variable and x(t) the unknown; x' may also be written v. Type a full equation (x'' + 0.5*x' + x = 0) or just the right-hand side F. The tool sets v = x' and reduces it to the system x' = v, v' = F(t, x, v) and draws the phase plane: horizontal axis x (position), vertical axis x' (velocity); there is no y in this problem and y is rejected. An equilibrium (x, x') = (c, 0) of the phase plane is the constant solution x ≡ c (the body at rest). If t appears in the equation it is non-autonomous: the picture is only the snapshot at t₀, and the initial values x(t₀), x'(t₀) start at that instant.",
          "Multiplication must be written out: t*y, not ty; powers use ^, for example y^2.",
        ],
        firstOrderLine: "A first-order equation has only the two variables t and y; x is rejected (the message asks you to write t instead).",
        secondOrderLine: "In a second-order equation x'' must appear linearly (x''^2, sin(x'') and the like cannot be reduced) and its coefficient must never vanish; both are checked numerically at sample points inside the entered range and at a few fixed points near the origin, at several times, so a term that is only active away from every sample point (a piecewise branch outside the box) cannot be detected.",
        termsLine: "Terms by mode: on the phase plane of a planar system or a second-order equation the tool says \"equilibrium point\" (a point where f = g = 0, with a stability classification; for a second-order equation it is the constant solution x ≡ c); for a first-order equation it says \"constant solution\" y = c (a solution, not a point; its stability is whether the solutions on either side approach or leave it); for a differential form it says \"singular point of the direction field\" (M = N = 0, direction undefined, no stability to speak of). A kept curve is a \"solution curve\" on a first-order picture and a \"trajectory\" on a phase plane.",
        equalScaleLine: "What \"equal scale\" means in each picture: for a first-order equation the angle of a curve is its slope dy/dt; for a planar system the directions of arrows and trajectories are their true directions in the phase plane (the slope along a trajectory is dy/dx, not a rate of change in time); for a second-order equation likewise, the slope along a trajectory being dx'/dx.",
        timeSeriesLine: "Time-series view: t horizontally, the solution's values x(t), y(t) vertically (x(t) and x'(t) for a second-order equation). This is the picture the chapter on forced oscillations, beats and resonance needs: for a non-autonomous equation the phase plane is only a snapshot at one instant, while x(t) shows how the amplitude rises and falls in time. A first-order picture is already the graph of y against t, so it has no such toggle.",
        functionsLead: "Functions you may use:",
        constantsLine: "Constants: pi and e.",
        paramsLine: "Parameters: an equation may contain letters for constants, for example k*y*(1 - y/L), -k*(y - Ta), x'' + 2*b*x' + w^2*x = 0. Every name you write that is not a variable (t, x, y, and v in a second-order equation), pi, e or a function appears by itself in the Parameters area under the expression, starting at 1 and highlighted: give it the value you want (negative and decimal values are fine). A name starts with a letter, and multiplication is still written out (ky is read as one parameter called ky; k times y is k*y). The four equation types share one set of parameters, and M and N, or f and g, use the same k. A parameter the equation still uses cannot be removed: take it out of the equation first. The values are part of the link (for example &p=k:0.8,L:2), so \"the logistic equation with k = 0.8, L = 2\" is a link you can hand out; the results, the exported PNG and the summary Claude reads all say which parameter values the picture was computed for.",
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
          "Blue curves run forward (t increasing), orange curves backward; on a differential form M dt + N dy = 0 a kept curve is one color, because the form has no direction. A curve through a point where uniqueness fails is dashed. The violet curves of an exact equation are level curves of the potential.",
          "Small gray rings: sample points where the vector field is undefined or infinite.",
          "Nullclines (switch them on under \"Show on the picture\"): x' = 0 is a solid teal curve and y' = 0 a dashed brown one (x' = 0 and x'' = 0 for a second-order equation; the single family dy/dt = 0 for a first-order equation; N = 0 and M = 0 for a differential form). The equilibria are exactly where the two families cross, so you can see why they are where they are; on a first-order picture the nullcline is where solution curves have their maxima and minima.",
          "Eigen-directions: at a hyperbolic equilibrium with real eigenvalues, a short dark line along each eigenvector of the linearization. A stable direction is solid with arrows pointing in, an unstable one dashed with arrows pointing out; a degenerate node has only one (that is what makes it degenerate), and complex eigenvalues (spirals, center or weak spiral) have no real eigen-direction, so nothing is drawn. The ⓘ of the equilibrium says which line is which.",
          "Separatrices: the four bold dark curves that leave each saddle along its eigen-directions (stable manifold solid, integrated backward in time; unstable manifold dashed, integrated forward). They divide the phase plane into regions with different fates: an initial point on one side of a separatrix and one on the other go to entirely different places. They are numerical curves, started about a pixel away from the saddle on the linearized direction.",
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
        snapshot: "Non-autonomous systems and non-autonomous second-order equations (t on the right-hand side): the picture is a snapshot at one time t, and no equilibria or stability classification are given; the trajectories you get by hovering and clicking start at the snapshot time.",
        domainEdge: "A constant solution on the domain edge (for example y = 0 of dy/dt = sqrt(y)): the field is defined on one side only, there is no linearization there, and the tool only describes the behavior of the solutions on the side where the field is defined.",
        truncated: "When there are too many equilibria or singular points the list is truncated and says that only the first few are listed; whether they form a continuum is judged from all the points found.",
        scan: "\"Last solution curve\" or \"Last trajectory\" says where each kept curve stopped (the end of the requested span, which is the time t on a first-order picture or a phase plane and the curve's own parameter on a differential form; the edge of the viewing box; an equilibrium; a blow-up; a singular point or the edge of the domain).",
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
        reconnect: MCP_RECONNECT_EN,
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
