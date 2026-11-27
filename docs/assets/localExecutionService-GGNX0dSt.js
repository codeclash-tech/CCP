function e(e,t){let n=t.toLowerCase();return[e?.returnType,...(e?.params||[]).map(e=>e.type)].some(e=>{let t=String(e||``).toLowerCase().trim();return t===n||t===`${n}[]`||t===`${n}[][]`})}var t={java:{start:`// ===== DATA STRUCTURE HELPERS START =====
`,end:`// ===== DATA STRUCTURE HELPERS END =====
`}},n={int:`int`,long:`long`,double:`double`,float:`float`,boolean:`boolean`,bool:`boolean`,char:`char`,string:`String`,"int[]":`int[]`,"long[]":`long[]`,"double[]":`double[]`,"float[]":`float[]`,"boolean[]":`boolean[]`,"char[]":`char[]`,"string[]":`String[]`,"int[][]":`int[][]`,"long[][]":`long[][]`,"double[][]":`double[][]`,"float[][]":`float[][]`,"boolean[][]":`boolean[][]`,"char[][]":`char[][]`,"string[][]":`String[][]`,"list<integer>":`List<Integer>`,"list<long>":`List<Long>`,"list<double>":`List<Double>`,"list<float>":`List<Float>`,"list<boolean>":`List<Boolean>`,"list<character>":`List<Character>`,"list<string>":`List<String>`,"list<list<integer>>":`List<List<Integer>>`,"list<list<long>>":`List<List<Long>>`,"list<list<double>>":`List<List<Double>>`,"list<list<float>>":`List<List<Float>>`,"list<list<boolean>>":`List<List<Boolean>>`,"list<list<string>>":`List<List<String>>`,listnode:`ListNode`,treenode:`TreeNode`,void:`void`};function r(e){let n=t.java;if(!e||typeof e!=`string`)return e||``;let r=e.indexOf(n.start);if(r===-1)return e;let i=e.indexOf(n.end,r+n.start.length);return i===-1?e:e.slice(0,r)+e.slice(i+n.end.length)}function i(e){let t=String(e||``).toLowerCase().trim();return n[t]?n[t]:t.startsWith(`list<`)&&t.endsWith(`>`)?`List<${i(t.slice(5,-1))}>`:t}function a(e){return!e||String(e).toLowerCase()===`void`}function o(n){let r=[];if(e(n,`ListNode`)&&r.push(`class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
`),e(n,`TreeNode`)&&r.push(`class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
}
`),r.length===0)return``;let i=t.java;return`${i.start}${r.join(`
`)}${i.end}`}function s(e){let t=[],n=e.replace(/^\s*import\s+[^;]+;\s*$/gm,e=>(t.push(e.trim()),``));return{imports:[...new Set(t)],body:n}}function c(e,t){let n=RegExp(`\\bclass\\s+${t}\\b`).exec(e);if(!n)return``;let r=e.indexOf(`{`,n.index);if(r<0)return``;let i=0,a=!1,o=``,s=!1;for(let t=r;t<e.length;t+=1){let r=e[t];if(a){s?s=!1:r===`\\`?s=!0:r===o&&(a=!1);continue}if(r===`"`||r===`'`)a=!0,o=r;else if(r===`{`)i+=1;else if(r===`}`&&--i===0)return e.slice(n.index,t+1)}return``}function l(e){if(typeof e!=`string`)return{imports:[],body:``};let{imports:t,body:n}=s(r(e).replace(/^\s*package\s+[\w.]+\s*;\s*$/gm,``));return{imports:t,body:(c(n,`Solution`)||n).trim()}}function u(e,t=[]){let n=[...new Set([...e,...t])];return n.length?`${n.join(`
`)}\n\n`:``}function d(e,t=`java`){if(typeof e!=`string`||!e.trim())return{valid:!1,errors:[`Program is empty.`]};if(t!==`java`)return{valid:!1,errors:[`Only Java submissions are supported.`]};let n=[],r=[...e.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].map(e=>e[1]),i=new Set(r);i.has(`Solution`)||n.push(`Missing required class: Solution.`),i.has(`Main`)||n.push(`Missing required class: Main.`);let a=e.search(/\bclass\s+[A-Za-z_$][\w$]*/),o=[...e.matchAll(/^\s*import\s+[^;]+;/gm)].at(-1);return o&&a>=0&&o.index>a&&n.push(`Imports must appear before class declarations.`),f(e)!==0&&n.push(`Unbalanced braces in generated program.`),{valid:n.length===0,errors:n}}function f(e){let t=0,n=`code`,r=!1;for(let i=0;i<e.length;i+=1){let a=e[i],o=e[i+1];if(n===`line-comment`){a===`
`&&(n=`code`);continue}if(n===`block-comment`){a===`*`&&o===`/`&&(n=`code`,i+=1);continue}if(n===`string`||n===`char`){r?r=!1:a===`\\`?r=!0:(n===`string`&&a===`"`||n===`char`&&a===`'`)&&(n=`code`);continue}a===`/`&&o===`/`?(n=`line-comment`,i+=1):a===`/`&&o===`*`?(n=`block-comment`,i+=1):a===`"`?n=`string`:a===`'`?n=`char`:a===`{`?t+=1:a===`}`&&--t}return t}var p=class extends Error{constructor(e){super(e),this.name=`CompilationGenerationError`}};function m(e){let t=new Set,n=e=>{let n=String(e||``).toLowerCase().trim();n&&t.add(n)};return n(e?.returnType),(e?.params||[]).forEach(e=>n(e.type)),t}function h(t){return e(t,`ListNode`)}function g(t){return e(t,`TreeNode`)}function _(e,t,n=`java`){if((n||``).toLowerCase().trim()!==`java`)throw new p(`Unsupported language: ${n}`);let r=e?.signature||{},i=Array.isArray(r.params)?r.params:[],a=r.name||`solution`,o=r.returnType||`void`,{imports:s,body:c}=l(t||``),u=v(r,i,a,o,s,c),f=d(u);if(!f.valid)throw new p(f.errors.join(` `));return u}function v(e,t,n,r,s,c){let l=m(e),d=h(e),f=g(e),p=t.map(e=>`${i(e.type,`java`)} ${e.name};`).join(`
        `),_=t.map(e=>`${e.name} = ${y(e)};`).join(`
        `),v=t.map(e=>e.name).join(`, `),S=i(r,`java`),C=a(r),w=C?`sol.${n}(${v});`:`${S} result = sol.${n}(${v});`,T=C?`System.out.println("null");`:`System.out.println(serialize(result));`,E=o(e),D=`public class Main {
    private static BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));

    private static String readNextLine() throws IOException {
        String line = reader.readLine();
        return line == null ? "" : line.trim();
    }

${b(l,d,f)}

${x(r,d,f)}

    public static void main(String[] args) throws Exception {
        ${p}
        ${_}

        Solution sol = new Solution();
        ${w}
        ${T}
    }
}
`;return`${u([`import java.util.*;`,`import java.io.*;`],s)}// Auto-generated judge wrapper
${E}

${D}
// ===== Participant Solution =====
${c}
`}function y(e){let t={int:`parseInt()`,long:`parseLong()`,double:`parseDouble()`,float:`parseFloat()`,boolean:`parseBool()`,bool:`parseBool()`,string:`parseString()`,char:`parseChar()`,"int[]":`parseIntArray()`,"long[]":`parseLongArray()`,"double[]":`parseDoubleArray()`,"float[]":`parseFloatArray()`,"boolean[]":`parseBooleanArray()`,"char[]":`parseCharArray()`,"string[]":`parseStringArray()`,"int[][]":`parseIntMatrix()`,"long[][]":`parseLongMatrix()`,"double[][]":`parseDoubleMatrix()`,"float[][]":`parseFloatMatrix()`,"boolean[][]":`parseBooleanMatrix()`,"char[][]":`parseCharMatrix()`,"string[][]":`parseStringMatrix()`,listnode:`parseLinkedList()`,treenode:`parseTreeNode()`,"list<integer>":`parseIntegerList()`,"list<long>":`parseLongList()`,"list<double>":`parseDoubleList()`,"list<string>":`parseStringList()`,"list<boolean>":`parseBooleanList()`}[(e.type||`int`).toLowerCase().trim()];if(!t)throw new p(`Unsupported Java parameter type "${e.type}".`);return t}function b(e,t,n){let r=[];r.push(`    private static List<String> splitArrayElements(String line) {
        String value = line.trim();
        if (value.startsWith("[") && value.endsWith("]")) {
            value = value.substring(1, value.length() - 1).trim();
        }
        List<String> elements = new ArrayList<>();
        if (value.isEmpty()) return elements;
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        boolean escaped = false;
        int depth = 0;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (escaped) {
                current.append(c);
                escaped = false;
            } else if (c == '\\\\' && quoted) {
                current.append(c);
                escaped = true;
            } else if (c == '"') {
                quoted = !quoted;
                current.append(c);
            } else if (!quoted && c == '[') {
                depth++;
                current.append(c);
            } else if (!quoted && c == ']') {
                depth--;
                current.append(c);
            } else if (!quoted && depth == 0 && c == ',') {
                elements.add(current.toString().trim());
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        elements.add(current.toString().trim());
        return elements;
    }
    private static String parseJsonString(String raw) {
        String value = raw.trim();
        if (value.length() < 2 || value.charAt(0) != '"' || value.charAt(value.length() - 1) != '"') return value;
        StringBuilder result = new StringBuilder();
        for (int i = 1; i < value.length() - 1; i++) {
            char c = value.charAt(i);
            if (c == '\\\\' && i + 1 < value.length() - 1) {
                char next = value.charAt(++i);
                if (next == 'n') result.append('\\n');
                else if (next == 'r') result.append('\\r');
                else if (next == 't') result.append('\\t');
                else result.append(next);
            } else result.append(c);
        }
        return result.toString();
    }
    private static String parseString() throws IOException {
        String s = readNextLine();
        return parseJsonString(s);
    }
    private static int parseInt() throws IOException { String s = readNextLine(); return s.isEmpty() ? 0 : Integer.parseInt(s); }
    private static long parseLong() throws IOException { String s = readNextLine(); return s.isEmpty() ? 0L : Long.parseLong(s); }
    private static double parseDouble() throws IOException { String s = readNextLine(); return s.isEmpty() ? 0.0 : Double.parseDouble(s); }
    private static float parseFloat() throws IOException { String s = readNextLine(); return s.isEmpty() ? 0.0f : Float.parseFloat(s); }
    private static boolean parseBool() throws IOException { String s = readNextLine(); return Boolean.parseBoolean(s); }
    private static char parseChar() throws IOException { String s = parseString(); return s.isEmpty() ? ' ' : s.charAt(0); }`);for(let[i,[a,o]]of Object.entries({int:[`int`,`Integer.parseInt`],long:[`long`,`Long.parseLong`],double:[`double`,`Double.parseDouble`],float:[`float`,`Float.parseFloat`],boolean:[`boolean`,`Boolean.parseBoolean`],char:[`char`,`parseJsonString`],string:[`String`,`parseJsonString`]})){let s=`${i}[]`,c=`${i}[][]`;if(e.has(s)||e.has(c)||i===`int`&&(t||n)){let e=i[0].toUpperCase()+i.slice(1),t=i===`char`?`String value = parseJsonString(parts.get(i)); result[i] = value.isEmpty() ? ' ' : value.charAt(0);`:i===`string`?`result[i] = parseJsonString(parts.get(i));`:i===`int`?`String value = parts.get(i).trim(); result[i] = value.equalsIgnoreCase("null") ? Integer.MIN_VALUE : Integer.parseInt(value);`:`result[i] = ${o}(parts.get(i).trim());`;r.push(`    private static ${a}[] parse${e}ArrayValue(String line) {
        List<String> parts = splitArrayElements(line);
        ${a}[] result = new ${a}[parts.size()];
        for (int i = 0; i < parts.size(); i++) { ${t} }
        return result;
    }
    private static ${a}[] parse${e}Array() throws IOException {
        return parse${e}ArrayValue(readNextLine());
    }`)}if(e.has(c)){let e=i[0].toUpperCase()+i.slice(1);r.push(`    private static ${a}[][] parse${e}Matrix() throws IOException {
        List<String> rows = splitArrayElements(readNextLine());
        ${a}[][] result = new ${a}[rows.size()][];
        for (int i = 0; i < rows.size(); i++) result[i] = parse${e}ArrayValue(rows.get(i));
        return result;
    }`)}}for(let[t,[n,i]]of Object.entries({integer:[`Integer`,`Integer.valueOf`],long:[`Long`,`Long.valueOf`],double:[`Double`,`Double.valueOf`],string:[`String`,`parseJsonString`],boolean:[`Boolean`,`Boolean.valueOf`]})){if(!e.has(`list<${t}>`))continue;let a=t[0].toUpperCase()+t.slice(1),o=`result.add(${i}(value));`;r.push(`    private static List<${n}> parse${a}List() throws IOException {
        List<${n}> result = new ArrayList<>();
        for (String value : splitArrayElements(readNextLine())) { ${o} }
        return result;
    }`)}return t&&r.push(`        private static ListNode parseLinkedList() throws IOException {
        int[] arr = parseIntArray();
        if (arr.length == 0) return null;
        ListNode head = new ListNode(arr[0]), curr = head;
        for (int i = 1; i < arr.length; i++) { curr.next = new ListNode(arr[i]); curr = curr.next; }
        return head;
    }`),n&&r.push(`    private static TreeNode parseTreeNode() throws IOException {
        int[] arr = parseIntArray();
        if (arr.length == 0 || arr[0] == Integer.MIN_VALUE) return null;
        TreeNode root = new TreeNode(arr[0]);
        Queue<TreeNode> q = new LinkedList<>();
        q.offer(root);
        int i = 1;
        while (!q.isEmpty() && i < arr.length) {
            TreeNode node = q.poll();
            if (i < arr.length && arr[i] != Integer.MIN_VALUE) { node.left = new TreeNode(arr[i]); q.offer(node.left); }
            i++;
            if (i < arr.length && arr[i] != Integer.MIN_VALUE) { node.right = new TreeNode(arr[i]); q.offer(node.right); }
            i++;
        }
        return root;
    }`),r.join(`

`)}function x(e,t,n){let r=(e||``).toLowerCase().trim();if(a(e))return`    private static String serialize(Object obj) { return String.valueOf(obj); }`;let i=[],o=r.endsWith(`[]`);o&&i.push(`        return serializeArray(obj);`);let s=o?`    private static String quote(String value) {
        return "\\"" + value.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"")
            .replace("\\n", "\\\\n").replace("\\r", "\\\\r").replace("\\t", "\\\\t") + "\\"";
    }
    private static String serializeArray(Object value) {
        if (value == null) return "null";
        int length = java.lang.reflect.Array.getLength(value);
        StringBuilder result = new StringBuilder("[");
        for (int i = 0; i < length; i++) {
            if (i > 0) result.append(",");
            Object item = java.lang.reflect.Array.get(value, i);
            if (item != null && item.getClass().isArray()) result.append(serializeArray(item));
            else if (item instanceof String || item instanceof Character) result.append(quote(String.valueOf(item)));
            else result.append(String.valueOf(item));
        }
        return result.append("]").toString();
    }`:``;return!o&&t&&i.push(`        if (obj instanceof ListNode) {
            StringBuilder sb = new StringBuilder("[");
            ListNode curr = (ListNode) obj;
            while (curr != null) {
                sb.append(curr.val);
                if (curr.next != null) sb.append(",");
                curr = curr.next;
            }
            return sb.append("]").toString();
        }`),!o&&n&&i.push(`        if (obj instanceof TreeNode) {
            if (obj == null) return "[]";
            StringBuilder sb = new StringBuilder("[");
            Queue<TreeNode> q = new LinkedList<>();
            q.offer((TreeNode) obj);
            boolean first = true;
            while (!q.isEmpty()) {
                TreeNode node = q.poll();
                if (node == null) { sb.append(first ? "" : ",").append("null"); first = false; continue; }
                if (!first) sb.append(",");
                sb.append(node.val);
                first = false;
                q.offer(node.left);
                q.offer(node.right);
            }
            return sb.append("]").toString();
        }`),o||i.push(`        return String.valueOf(obj);`),`${s}
    private static String serialize(Object obj) {
        if (obj == null) return "null";
${i.join(`
`)}
    }`}var S=e=>e.endsWith(`[]`)||e.startsWith(`list<`)||e===`listnode`||e===`treenode`;function C(e,t){let n=(e||`int`).toLowerCase().trim(),r=t==null?``:String(t).trim();if(n===`string`||n===`char`)return r===``?``:r.startsWith(`"`)&&r.endsWith(`"`)?r:JSON.stringify(r);if(n===`boolean`)return r.toLowerCase()===`false`?`false`:`true`;if(S(n)){if(r===``)return`[]`;try{return JSON.parse(r),r}catch{return`[]`}}return r}function w(e,t){let n=Array.isArray(e?.params)?e.params:[];return n.length===0?``:n.map(e=>C(e.type,t?t[e.name]:void 0)).join(`
`)}var T=`__REFERENCE_OUTPUT_SENTINEL__`,E={COMPILATION_ERROR:`Compilation failed.`,COMPILE_ERROR:`Compilation failed.`,RUNTIME_ERROR:`Runtime error.`,TIME_LIMIT_EXCEEDED:`Execution timed out.`,MEMORY_LIMIT_EXCEEDED:`Memory limit exceeded.`,SYSTEM_ERROR:`Code execution is currently unavailable.`,ERROR:`Execution failed.`};function D(e,t){return e.parameterValues&&typeof e.parameterValues==`object`&&t?.name?w(t,e.parameterValues):String(e.input??``)}function O(e){return String(e.actualOutput??e.output??e.stdout??``).trim()}function k(e){let t=e?.message;throw typeof t==`string`&&/^(?:Source code|Only Java|At least one test case|No more than \d+ test cases|Test case \d+|The execution time limit|The execution memory limit)/.test(t)?Error(t):Error(`Code execution is currently unavailable.`)}function A(e,t){let n=String(t.signature?.returnType||`void`).trim().toLowerCase();e.forEach((e,t)=>{let r=E[e?.status];if(r)throw Error(`Reference solution failed on test case ${t+1}. ${r}`);let i=O(e||{});if(n!==`void`&&(!i||i.toLowerCase()===`null`))throw Error(`Reference solution failed on test case ${t+1}. It produced no output.`)})}async function j(e,t=typeof window<`u`?window.codeClashDesktop:void 0){if(!e||typeof e!=`object`)throw TypeError(`A question is required to generate expected outputs.`);if(typeof e.referenceSolution!=`string`||!e.referenceSolution.trim())throw TypeError(`A reference solution is required to generate expected outputs.`);if(typeof t?.engine?.execute!=`function`)throw Error(`Code execution is currently unavailable.`);let n=Array.isArray(e.testCases)?e.testCases:[...e.visibleTestCases||[],...e.hiddenTestCases||[]];if(n.length===0)throw Error(`Add at least one test case.`);let r=n.map(t=>({input:D(t,e.signature),expectedOutput:T})),i=_(e,e.referenceSolution,e.referenceSolutionLanguage||`java`),a;try{a=await t.engine.execute({code:i,language:e.referenceSolutionLanguage||`java`,testCases:r})}catch(e){k(e)}if(!Array.isArray(a?.results)||a.results.length!==r.length)throw Error(`Code execution is currently unavailable.`);return A(a.results,e),{testCases:n.map((e,t)=>({...e,input:r[t].input,expectedOutput:O(a.results[t])})),accepted:!0,message:`Expected outputs generated successfully.`}}async function M({question:e,code:t,language:n}){if(!e||typeof t!=`string`)throw TypeError(`A question and source code are required for code execution.`);if(!window.codeClashDesktop?.engine?.execute)throw Error(`Code execution is currently unavailable.`);let r=(Array.isArray(e.testCases)?e.testCases:[...e.visibleTestCases||[],...e.hiddenTestCases||[]]).filter(t=>t.input!==void 0&&t.input!==null||t.parameterValues&&typeof t.parameterValues==`object`&&e.signature?.name&&Object.keys(t.parameterValues).length>0).map(t=>({input:D(t,e.signature),expectedOutput:t.expectedOutput??``}));if(r.length===0)throw Error(`No test cases are available for this question.`);let i=e.signature?.name?_(e,t,n):t;try{let e=await window.codeClashDesktop.engine.execute({code:i,language:n,testCases:r});return{...e,results:Array.isArray(e?.results)?e.results.map((e,t)=>({...e,input:e.input??r[t]?.input??``,output:e.actualOutput??e.output??e.stdout??e.error??``,expectedOutput:e.expectedOutput??r[t]?.expectedOutput??``})):[]}}catch(e){k(e)}}async function N({apiBaseUrl:e,accessToken:t,questionId:n,roomCode:r,question:i,code:a,language:o}){if(!i||typeof a!=`string`)throw TypeError(`A question and source code are required for local submission.`);if(typeof window.codeClashDesktop?.assessment?.submit!=`function`)throw Error(`The CogniClash desktop submission service is not available.`);let s=i.signature?.name?_(i,a,o):a,c=(Array.isArray(i.testCases)?i.testCases:[...i.visibleTestCases||[],...i.hiddenTestCases||[]]).filter(e=>e.input!==void 0&&e.input!==null||e.parameterValues&&typeof e.parameterValues==`object`&&i.signature?.name&&Object.keys(e.parameterValues).length>0).map(e=>({input:D(e,i.signature),expectedOutput:String(e.expectedOutput??``)}));return window.codeClashDesktop.assessment.submit({apiBaseUrl:e,accessToken:t,roomCode:r,questionId:n,code:a,executionCode:s,testCases:c,language:o})}async function P({apiBaseUrl:e,accessToken:t,cycleId:n,question:r,code:i}){if(!r||typeof i!=`string`)throw TypeError(`A question and source code are required for local submission.`);if(typeof window.codeClashDesktop?.assessment?.submitDaily!=`function`)throw Error(`The CogniClash desktop submission service is not available.`);let a=(Array.isArray(r.testCases)?r.testCases:[...r.visibleTestCases||[],...r.hiddenTestCases||[]]).filter(e=>e.input!==void 0&&e.input!==null||e.parameterValues&&typeof e.parameterValues==`object`&&r.signature?.name&&Object.keys(e.parameterValues).length>0).map(e=>({input:D(e,r.signature),expectedOutput:String(e.expectedOutput??``)}));if(a.length===0)throw Error(`No test cases are available for this question.`);return window.codeClashDesktop.assessment.submitDaily({apiBaseUrl:e,accessToken:t,cycleId:n,questionId:r.id,code:i,executionCode:r.signature?.name?_(r,i,`java`):i,testCases:a})}export{N as i,j as n,P as r,M as t};