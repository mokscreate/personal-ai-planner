import { addDays, localDate } from "./domain.ts";
export const chapters = [
  {
    id: "intro",
    title: "认识SQL与搭建练习环境",
    hours: 3,
    topics: "数据库、表、行与列；SQL与PostgreSQL的区别；连接工具与执行查询",
    goal: "能打开练习数据库，读懂表结构，执行第一条SELECT。",
    intro:
      "SQL是与关系型数据库交流的语言。MySQL、PostgreSQL、SQLite是执行SQL的数据库；DBeaver和DataGrip是连接它们的客户端。先建立“表中一行代表什么”的意识，再学习语法。",
    example: "SELECT * FROM users LIMIT 5;",
    check:
      "在外部工具导入练习数据，查看users表，返回前5行，并说明每一列的含义。",
    lessonIds: [],
    video: "PostgreSQL安装、DBeaver连接、SQL基本操作",
  },
  {
    id: "select",
    title: "查询、筛选与排序",
    hours: 6,
    topics: "SELECT、WHERE、AND/OR、IN、LIKE、ORDER BY、LIMIT",
    goal: "按业务要求筛选正确的行和列，明确结果顺序。",
    intro:
      "SELECT决定返回哪些列，WHERE决定保留哪些行，ORDER BY决定顺序。多个条件混用AND与OR时加括号；排序金额相同时补充稳定的次级排序字段。",
    example:
      "SELECT id, amount FROM orders\nWHERE status = 'paid'\nORDER BY amount DESC, id ASC;",
    check: "完成大额付款订单练习，并解释为什么退款订单不能计入结果。",
    lessonIds: ["filter"],
    video: "基础SELECT、过滤、排序与分页",
  },
  {
    id: "aggregate",
    title: "分组汇总与业务统计",
    hours: 5,
    topics: "COUNT、SUM、AVG、GROUP BY、HAVING、NULL",
    goal: "计算订单数与收入，区分行筛选和分组筛选。",
    intro:
      "WHERE在分组前筛选行；HAVING在分组后筛选统计结果。COUNT(*)数行，COUNT(字段)忽略NULL。先明确收入是否包含退款，再决定过滤条件。",
    example:
      "SELECT channel, SUM(amount) AS revenue\nFROM orders WHERE status = 'paid'\nGROUP BY channel;",
    check: "按渠道计算付款订单数和收入，并说明COUNT(*)与COUNT(字段)的差异。",
    lessonIds: ["group"],
    video: "聚合函数、GROUP BY、HAVING",
  },
  {
    id: "joins",
    title: "多表关联与重复计算",
    hours: 8,
    topics: "主键与外键、INNER JOIN、LEFT JOIN、一对多关系",
    goal: "连接用户与订单，识别关联后金额被放大的原因。",
    intro:
      "关联条件通常是一个表的主键对应另一个表的外键。订单和访问同时关联到用户时，两组一对多记录可能相乘。应先按正确粒度汇总，再关联；不要用DISTINCT掩盖错误口径。",
    example:
      "SELECT o.id, u.name, o.amount\nFROM orders o JOIN users u ON o.user_id = u.id;",
    check: "完成订单与用户关联，说明一人多次访问为什么可能导致订单收入重复。",
    lessonIds: ["join"],
    video: "多表查询、内连接、外连接",
  },
  {
    id: "subqueries",
    title: "子查询、CTE与缺失记录",
    hours: 7,
    topics: "EXISTS、NOT EXISTS、WITH、分步骤查询",
    goal: "拆解复杂查询，找出未付款用户，保留零记录。",
    intro:
      "子查询把一个问题的中间结果交给另一个查询。WITH给中间结果命名，方便逐步检查。NOT EXISTS适合判断“不存在符合条件的记录”，避免NOT IN遇到NULL时的陷阱。",
    example:
      "SELECT u.id, u.name FROM users u\nWHERE NOT EXISTS (SELECT 1 FROM orders o\nWHERE o.user_id = u.id AND o.status = 'paid');",
    check:
      "区分没有订单、只有退款、只有待付款三种情况，返回没有付款订单的用户。",
    lessonIds: ["zero"],
    video: "子查询、EXISTS；补充搜索CTE WITH",
  },
  {
    id: "metrics",
    title: "日期、条件计算与转化率",
    hours: 6,
    topics: "CASE WHEN、日期处理、去重人数、分子分母、整数除法",
    goal: "给业务指标写清楚口径并检查边界情况。",
    intro:
      "转化率首先是业务定义，其次才是除法。访问次数与访问人数不是同一个分母；多次付款不能多算一个买家。日期函数在PostgreSQL和SQLite中有差异，跟随你实际使用的数据库文档。",
    example:
      "SELECT SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_orders\nFROM orders;",
    check: "完成访问用户付款转化率，并解释去重、NULL和分母为零时如何处理。",
    lessonIds: ["rate"],
    video: "流程控制函数、日期函数；补充搜索SQL转化率",
  },
  {
    id: "windows",
    title: "窗口函数与分组排名",
    hours: 7,
    topics: "OVER、PARTITION BY、ROW_NUMBER、RANK、LAG",
    goal: "完成组内排名，区分并列名次与固定条数。",
    intro:
      "GROUP BY把多行压成一组；窗口函数保留每一行，同时计算所在组的统计量。ROW_NUMBER依次编号，RANK在并列后跳号；取前两笔和前两名可能是不同问题。",
    example:
      "SELECT id, channel, ROW_NUMBER() OVER (\nPARTITION BY channel ORDER BY amount DESC, id ASC) AS rn\nFROM orders;",
    check:
      "取每个渠道前两笔付款订单，解释金额相同的处理方法，再尝试上一笔金额对比。",
    lessonIds: ["rank"],
    video: "补充搜索PostgreSQL窗口函数、ROW_NUMBER、LAG",
  },
  {
    id: "review",
    title: "综合复习与求职表达",
    hours: 6,
    topics: "查询拆解、结果校验、错题复做、业务解释",
    goal: "独立写查询，解释结果，并能发现漏算与重复计算。",
    intro:
      "先口头解释一行数据代表什么、筛选口径是什么，再写SQL。用总量、零记录、重复记录和异常样本交叉检查结果。能解释错误比只记住答案更重要。",
    example:
      "-- 先写业务口径，再写SQL。\n-- 最后用小样本、总量和边界情况检查。",
    check:
      "独立复做核心练习，解释两个曾犯的错误，并用自己的话说明每个指标的含义。",
    lessonIds: ["filter", "group", "join", "zero", "rate", "rank"],
    video: "按错题回看对应片段，不必重看全套",
  },
];
export const totalHours = chapters.reduce((n, c) => n + c.hours, 0);
export function studyPlan(start: string, days: number) {
  if (!Number.isInteger(days) || days < 7 || days > 730)
    throw Error("周期需要在7到730天之间");
  let sum = 0;
  return {
    start,
    days,
    totalHours,
    weeklyHours: (totalHours * 7) / days,
    dailyHours: totalHours / days,
    finish: addDays(start, days - 1),
    chapters: chapters.map((c) => {
      sum += c.hours;
      return {
        id: c.id,
        due: addDays(
          start,
          Math.max(0, Math.ceil((sum / totalHours) * days) - 1),
        ),
      };
    }),
  };
}
export const initialStudyPlan = () => studyPlan(localDate(), 112);
