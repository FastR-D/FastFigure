export interface RetrievalFigure {id:string;title:string}
export interface Query {raw:string;terms:string[];topicTerms:string[];concepts:[string,string,boolean?][];clipText:string}
export interface Index {rows:{tf:Map<string,number>;title:Set<string>;length:number;tags:string[]}[];idf:Record<string,number>;avgdl:number}
export interface RankResult {i:number;lexical:number;coverage:number;structure:number;image:number;text:number;hits:string[];matched:string[];rrf:number;s:number;score:number;reason:string}
export function prepareQuery(raw:string,idf?:Record<string,number>):Query
export function buildIndex(data:{figs:RetrievalFigure[];ids:string[];bm:{docs:string[][]};IE?:Float32Array;TE?:Float32Array}):Index
export function rank(index:Index,query:Query,candidates:number[],imageScores:Float32Array,textScores:Float32Array):RankResult[]
