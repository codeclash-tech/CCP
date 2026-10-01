export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? "http://localhost:5000/api"
    : "https://ccp-backend-qylz.onrender.com/api");

export const SUBMISSION_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  ERROR: "ERROR",
  DISQUALIFIED: "DISQUALIFIED",
};

export const USER_ROLES = {
  USER: "USER",
  ADMIN: "ADMIN",
};

export const DIFFICULTY = {
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
};

export const DIFFICULTY_COLORS = {
  EASY: "#2ea043",
  MEDIUM: "#d29922",
  HARD: "#da3633",
};

export const STATUS_COLORS = {
  PASSED: "#2ea043",
  FAILED: "#da3633",
  ERROR: "#f85149",
  PENDING: "#d29922",
  ACCEPTED: "#2ea043",
  REJECTED: "#da3633",
  DISQUALIFIED: "#f85149",
  PROCESSING: "#d29922",
};

export const MAX_VIOLATIONS = 3;

export const RENDER_AWAKE_MESSAGES = [
  "Waking up server containers from deep sleep...",
  "Allocating memory blocks and warming up compiler...",
  "Teaching the backend that 0 == '0'...",
  "Executing hidden edge cases in sandbox container...",
  "Verifying AST structures and heap allocation...",
  "Convincing the garbage collector to cooperate...",
  "Spinning up virtual machines in the background...",
  "Optimizing tail calls and inlining functions...",
  "Resolving npm dependency conflicts (just kidding)...",
  "Calibrating the LeetCode judge engine...",
  "Evading rate limits with tactical retries...",
  "Preparing the sandbox for untrusted code...",
  "Running pre-submission linting gauntlet...",
  "Bribing the kernel scheduler for CPU time...",
];

export const DEVELOPER_QUOTES = [
  { quote: "Simplicity is prerequisite for reliability.", author: "Edsger W. Dijkstra" },
  { quote: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
  { quote: "First solve the problem, then write the code.", author: "John Johnson" },
  { quote: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
  { quote: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { quote: "Premature optimization is the root of all evil.", author: "Donald Knuth" },
  { quote: "The best way to predict the future is to implement it.", author: "David Heinemeier Hansson" },
  { quote: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { quote: "Programs must be written for people to read, and only incidentally for machines to execute.", author: "Harold Abelson" },
  { quote: "Debugging is twice as hard as writing the code in the first place.", author: "Brian Kernighan" },
];

export const LINKEDIN_SHARE_TEXT = `I just completed today's coding challenge on [Platform Name]! 

Check out my performance: 
- Score: {score} 
- Tests Passed: {passed}/{total} 
- Global Rank: #{rank}

#DailyCoding #Algorithms #TechChallenge #SoftwareEngineering #CodingChallenge`;

export const DEFAULT_STARTER_CODE = `class Solution {
    public int solution(int input) {
        // Write your code here
        return input;
    }
}`;

// Battle Room Constants
export const BATTLE_ROOM_STATUS = {
  UPCOMING: "UPCOMING",
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
};

export const BATTLE_ROOM_STATUS_COLORS = {
  UPCOMING: "#d29922",
  ACTIVE: "#2ea043",
  CLOSED: "#da3633",
};

export const MAX_QUESTIONS_PER_ROOM = 20;
export const MAX_TIME_LIMIT_MINUTES = 480;
export const MIN_TIME_LIMIT_MINUTES = 1;
export const DEFAULT_ROOM_TIME_LIMIT = 60;
export const MAX_PARTICIPANTS_PER_ROOM = 500;

// Battle rooms intentionally expose Java only.
export const SUPPORTED_LANGUAGES = [
  { id: "java", label: "Java", monacoId: "java", extension: ".java", defaultStarter: `class Solution {\n    public int[] solution(int[] nums, int target) {\n        // Write your code here\n        return new int[]{};\n    }\n}` },
];

export const LANGUAGE_BY_ID = Object.fromEntries(SUPPORTED_LANGUAGES.map((l) => [l.id, l]));

export const TIME_LIMIT_UNITS = [
  { id: "minutes", label: "Minutes", multiplier: 1 },
  { id: "hours", label: "Hours", multiplier: 60 },
  { id: "days", label: "Days", multiplier: 60 * 24 },
  { id: "weeks", label: "Weeks", multiplier: 60 * 24 * 7 },
];

export const NON_AI_CODER_TAG = "Non-AI Coder";
export const BATTLE_SHARE_HASHTAGS = "#NonAICoder #CodingBattle #TechChallenge #CodingChallenge";

// ------------------------------------------------------------------------
// Authoring System (LeetCode / HackerRank style problem authoring)
// ------------------------------------------------------------------------

export const TEST_CASE_SEPARATOR = "---";

// Problem types selectable by admins when authoring a question.
export const PROBLEM_TYPES = [
  { id: "array", label: "Array", description: "1D arrays and index/pointer logic" },
  { id: "string", label: "String", description: "String manipulation and matching" },
  { id: "linked-list", label: "Linked List", description: "Singly/doubly linked list problems" },
  { id: "tree", label: "Tree", description: "Binary trees, BSTs, traversal" },
  { id: "graph", label: "Graph", description: "Graphs, BFS/DFS, shortest paths" },
  { id: "matrix", label: "Matrix", description: "2D arrays / grid problems" },
  { id: "dynamic-programming", label: "Dynamic Programming", description: "DP over states and transitions" },
  { id: "greedy", label: "Greedy", description: "Greedy choice / optimization" },
  { id: "stack", label: "Stack", description: "LIFO data structure problems" },
  { id: "queue", label: "Queue", description: "FIFO data structure and BFS" },
  { id: "binary-search", label: "Binary Search", description: "Search over sorted data" },
  { id: "math", label: "Math", description: "Number theory, arithmetic, combinatorics" },
  { id: "bit-manipulation", label: "Bit Manipulation", description: "Bitwise operators and masks" },
  { id: "custom", label: "Custom", description: "Custom / special judge problems" },
];

export const PROBLEM_TYPE_BY_ID = Object.fromEntries(
  PROBLEM_TYPES.map((t) => [t.id, t])
);

export const AUTHORING_LANGUAGES = [
  { id: "java", label: "Java", extension: ".java", monacoId: "java" },
];

export const SIGNATURE_EXAMPLES = {
  java: "public int[] twoSum(int[] nums, int target)",
};

export const DEFAULT_FUNCTION_SIGNATURE_PLACEHOLDER =
  "public int[] twoSum(int[] nums, int target)";

// ------------------------------------------------------------------------
// Parameter-based workflow (Step 2 & 3)
// ------------------------------------------------------------------------

// Return type groups as shown in the dropdown (Step 2).
export const RETURN_TYPE_GROUPS = [
  {
    label: "Primitive",
    types: ["int", "long", "double", "float", "boolean", "char", "string", "void"],
  },
  {
    label: "1D Arrays",
    types: ["int[]", "long[]", "double[]", "float[]", "boolean[]", "char[]", "string[]"],
  },
  {
    label: "2D Arrays",
    types: ["int[][]", "long[][]", "double[][]", "float[][]", "boolean[][]", "char[][]", "string[][]"],
  },
  {
    label: "Collections",
    types: ["list<Integer>", "list<Long>", "list<Double>", "list<String>", "list<Boolean>"],
  },
  {
    label: "Structures",
    types: ["ListNode", "TreeNode"],
  },
];

// Parameter type groups shown in the parameter builder (Step 3).
// `void` is intentionally excluded (never a parameter type).
export const PARAMETER_TYPE_GROUPS = [
  {
    label: "Primitive",
    types: ["int", "long", "double", "float", "boolean", "char", "string"],
  },
  {
    label: "1D Arrays",
    types: ["int[]", "long[]", "double[]", "float[]", "boolean[]", "char[]", "string[]"],
  },
  {
    label: "2D Arrays",
    types: ["int[][]", "long[][]", "double[][]", "boolean[][]", "char[][]", "string[][]"],
  },
  {
    label: "Collections",
    types: ["list<Integer>", "list<Long>", "list<Double>", "list<String>", "list<Boolean>"],
  },
  {
    label: "Structures",
    types: ["ListNode", "TreeNode"],
  },
];

export const ALL_RETURN_TYPES = RETURN_TYPE_GROUPS.flatMap((g) => g.types);
export const ALL_PARAMETER_TYPES = PARAMETER_TYPE_GROUPS.flatMap((g) => g.types);

// Category values for Step 1 (aligned with backend CATEGORY_VALUES).
export const CATEGORY_VALUES = [
  "Array", "String", "Matrix", "Linked List", "Binary Tree", "Graph",
  "Stack", "Queue", "Heap", "HashMap", "Sorting", "Searching",
  "Dynamic Programming", "Greedy", "Backtracking", "Bit Manipulation", "Math", "Custom",
];

// Tag suggestions for Step 1.
export const TAG_SUGGESTIONS = [
  "array", "hash-map", "two-pointers", "sorting", "stack", "queue", "sliding-window",
  "binary-search", "recursion", "linked-list", "tree", "graph", "dfs", "bfs",
  "dynamic-programming", "greedy", "backtracking", "bit-manipulation", "math",
  "string", "matrix", "prefix-sum", "heap", "memoization", "topological-sort",
];

// Placeholder texts for each parameter type in the test-case builder.
export const PARAM_PLACEHOLDER = {
  int: "0",
  long: "0",
  double: "1.5",
  float: "1.5",
  boolean: "true",
  char: '"a"',
  string: '"hello"',
  "int[]": "[1,2,3]",
  "long[]": "[1,2,3]",
  "double[]": "[1.5,2.5]",
  "float[]": "[1.5,2.5]",
  "boolean[]": "[true,false]",
  "char[]": '["a","b"]',
  "string[]": '["a","b"]',
  "int[][]": "[[1,2],[3,4]]",
  "long[][]": "[[1,2],[3,4]]",
  "double[][]": "[[1.5,2.5]]",
  "float[][]": "[[1.5,2.5]]",
  "boolean[][]": "[[true,false]]",
  "char[][]": '[["a","b"]]',
  "string[][]": '[["a","b"]]',
  "list<Integer>": "[1,2,3]",
  "list<Long>": "[1,2,3]",
  "list<Double>": "[1.5,2.5]",
  "list<String>": '["a","b"]',
  "list<Boolean>": "[true,false]",
  ListNode: "[1,2,3,4,5]",
  TreeNode: "[1,2,3,4,5]",
};
