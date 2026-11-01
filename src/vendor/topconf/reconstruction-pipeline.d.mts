import type { ReconstructionScene, ReconstructionNode, ReconstructionPatch } from '../../core/reconstructionContract.ts'
export interface Worker {id:string;title?:string;kind:string;x:number;y:number;w:number;h:number;coreX?:number;coreY?:number;coreRight?:number;coreBottom?:number;parentId?:string;parentRegionId?:string;editableOwners?:string[];excludeRects?:{x:number;y:number;w:number;h:number}[];detailPass?:boolean;index?:number;targetIds?:string[];targeted?:boolean}
export function planSemanticRegions(scene:ReconstructionScene,width:number,height:number):Worker[]
export function planDetailRegions(regions:Worker[],width:number,height:number,maxCore?:number,padding?:number):Worker[]
export function snapshotVersions(scene:ReconstructionScene):Record<string,number>
export function regionObjectCatalog(scene:ReconstructionScene,region:Worker):{canvas:{width:number;height:number};nodes:ReconstructionNode[];readOnlyContext:ReconstructionNode[];excludeRects:{x:number;y:number;w:number;h:number}[]}
export function translateNode<T extends ReconstructionNode>(node:T,dx:number,dy:number):T
export function applyRegionPatch(scene:ReconstructionScene,region:Worker,patch:ReconstructionPatch,versions:Record<string,number>):{scene:ReconstructionScene;conflicts:{reason:string}[];rejected:{reason:string}[];ignored:{reason:string}[]}
