export const lessons = [
  {
    id: "filter",
    stage: "01 · 查询基础",
    title: "找到已付款的大额订单",
    level: "入门",
    minutes: 15,
    description:
      "运营同事想查看已付款且金额不少于100元的订单。返回订单编号 id、金额 amount，按金额从高到低排列；金额相同时按 id 升序。",
    columns: ["id", "amount"],
    ordered: true,
    hints: [
      "一行代表一笔订单。先从 orders 中选择需要的列。",
      "用 WHERE 同时筛选 status 和 amount，条件之间用 AND。",
      "ORDER BY amount DESC, id ASC 可以明确处理金额相同的情况。",
    ],
    answer:
      "SELECT id, amount FROM orders WHERE status = 'paid' AND amount >= 100 ORDER BY amount DESC, id ASC",
  },
  {
    id: "group",
    stage: "02 · 筛选与汇总",
    title: "每个渠道贡献了多少收入",
    level: "入门",
    minutes: 20,
    description:
      "只统计已付款订单。按订单渠道 channel 分组，返回 channel、订单数 order_count、收入 revenue。按收入降序、渠道升序排列。退款和待付款订单不计入收入。",
    columns: ["channel", "order_count", "revenue"],
    ordered: true,
    hints: [
      "先筛选已付款订单，再分组。",
      "COUNT(*) 统计订单数；SUM(amount) 累加收入。",
      "GROUP BY channel，并用 AS 为统计列命名。",
    ],
    answer:
      "SELECT channel, COUNT(*) AS order_count, SUM(amount) AS revenue FROM orders WHERE status='paid' GROUP BY channel ORDER BY revenue DESC, channel ASC",
  },
  {
    id: "join",
    stage: "03 · 多表关联",
    title: "把订单和用户对应起来",
    level: "进阶",
    minutes: 20,
    description:
      "列出所有已付款订单的编号 order_id、用户姓名 name、金额 amount。通过 orders.user_id 关联 users.id，按 order_id 升序。",
    columns: ["order_id", "name", "amount"],
    ordered: true,
    hints: [
      "用户姓名在 users 表里，订单金额在 orders 表里。",
      "使用 JOIN users ON orders.user_id = users.id。",
      "只关联用户表，避免关联访问表导致一笔订单被重复计算。",
    ],
    answer:
      "SELECT o.id AS order_id, u.name, o.amount FROM orders o JOIN users u ON o.user_id=u.id WHERE o.status='paid' ORDER BY order_id",
  },
  {
    id: "zero",
    stage: "03 · 多表关联",
    title: "找出没有付款订单的用户",
    level: "进阶",
    minutes: 25,
    description:
      "包括从未下单、只有待付款或退款订单的用户。返回用户 id、name，按 id 升序。",
    columns: ["id", "name"],
    ordered: true,
    hints: [
      "不能只找完全没有订单的用户，退款和待付款也不算成功付款。",
      "可以用 NOT EXISTS 判断是否不存在属于该用户的已付款订单。",
      "另一种写法是 LEFT JOIN，在 ON 条件里限制 status，然后判断订单 id IS NULL。",
    ],
    answer:
      "SELECT u.id,u.name FROM users u WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.status='paid') ORDER BY u.id",
  },
  {
    id: "rate",
    stage: "04 · 业务口径",
    title: "访问用户的付款转化率",
    level: "进阶",
    minutes: 25,
    description:
      "分母为 visits 中出现过的去重用户数，分子为这些用户中至少有一笔已付款订单的人数（不限日期）。返回一行：visitors、buyers、conversion_rate。转化率是0到1的小数，保留两位小数；重复访问和重复付款只算一个人。",
    columns: ["visitors", "buyers", "conversion_rate"],
    ordered: false,
    hints: [
      "这是用户口径，不是访问次数或订单数。",
      "先 DISTINCT user_id，再用 EXISTS 判断是否付款，避免多表关联放大行数。",
      "ROUND(1.0 * 分子 / 分母, 2) 避免整数除法。",
    ],
    answer:
      "WITH people AS (SELECT DISTINCT user_id FROM visits), counts AS (SELECT COUNT(*) AS visitors, SUM(CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.user_id=p.user_id AND o.status='paid') THEN 1 ELSE 0 END) AS buyers FROM people p) SELECT visitors,buyers,ROUND(1.0*buyers/visitors,2) AS conversion_rate FROM counts",
  },
  {
    id: "rank",
    stage: "05 · 窗口函数",
    title: "每个渠道的前两笔订单",
    level: "挑战",
    minutes: 30,
    description:
      "在每个订单渠道内，将已付款订单按金额降序、id升序编号，取前两笔。返回 channel、id、amount、rn，并按 channel 升序、rn 升序排列。这里取两笔订单，金额并列也不增加名额。",
    columns: ["channel", "id", "amount", "rn"],
    ordered: true,
    hints: [
      "先排除非付款订单。",
      "ROW_NUMBER() OVER (PARTITION BY channel ORDER BY amount DESC,id ASC) 生成每个渠道的编号。",
      "用 CTE 或子查询，在外层 WHERE rn <= 2。",
    ],
    answer:
      "WITH ranked AS (SELECT channel,id,amount,ROW_NUMBER() OVER (PARTITION BY channel ORDER BY amount DESC,id ASC) AS rn FROM orders WHERE status='paid') SELECT channel,id,amount,rn FROM ranked WHERE rn<=2 ORDER BY channel,rn",
  },
];
export function dataset(variant = 0) {
  const users = [
    [1, "林雨", "自然搜索"],
    [2, "陈晨", "社交媒体"],
    [3, "李禾", "自然搜索"],
    [4, "王安", "推荐"],
    [5, "周宁", "推荐"],
    [6, "赵可", "社交媒体"],
  ];
  const orders = [
    [101, 1, "2026-09-01", 120, "paid", "自然搜索"],
    [102, 2, "2026-09-01", 80, "paid", "社交媒体"],
    [103, 1, "2026-09-02", 200, "paid", "自然搜索"],
    [104, 3, "2026-09-02", 150, "refunded", "自然搜索"],
    [105, 4, "2026-09-03", 300, "paid", "推荐"],
    [106, 2, "2026-09-03", 100, "paid", "社交媒体"],
    [107, 5, "2026-09-04", 90, "pending", "推荐"],
    [108, 4, "2026-09-04", 300, "paid", "推荐"],
    [109, 1, "2026-09-05", 60, "paid", "自然搜索"],
    [110, 3, "2026-09-05", 250, "pending", "自然搜索"],
  ];
  const visits = [
    [1, 1, "2026-09-01"],
    [2, 1, "2026-09-02"],
    [3, 2, "2026-09-01"],
    [4, 3, "2026-09-02"],
    [5, 4, "2026-09-03"],
    [6, 5, "2026-09-04"],
    [7, 5, "2026-09-05"],
  ];
  if (variant) {
    orders.push(
      [111, 6, "2026-09-06", 100, "paid", "社交媒体"],
      [112, 3, "2026-09-06", 500, "paid", "自然搜索"],
    );
    visits.push([8, 6, "2026-09-06"]);
    orders[0][3] = 95;
  }
  return [
    {
      name: "users",
      label: "用户",
      columns: ["id", "name", "signup_channel"],
      types: ["INTEGER", "TEXT", "TEXT"],
      rows: users,
    },
    {
      name: "orders",
      label: "订单",
      columns: ["id", "user_id", "order_date", "amount", "status", "channel"],
      types: ["INTEGER", "INTEGER", "TEXT", "REAL", "TEXT", "TEXT"],
      rows: orders,
    },
    {
      name: "visits",
      label: "访问记录",
      columns: ["id", "user_id", "visit_date"],
      types: ["INTEGER", "INTEGER", "TEXT"],
      rows: visits,
    },
  ];
}
