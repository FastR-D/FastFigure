export const sketchStyleIds=['comic','xkcd','excalidraw','drawio'] as const
export type SketchStyle=typeof sketchStyleIds[number]
export const sketchStyleLabels:Record<SketchStyle,string>={comic:'Comic 手绘曲线',xkcd:'XKCD',excalidraw:'Excalidraw',drawio:'draw.io Sketch'}
export const sketchProfiles={
  comic:{roughness:.45,bowing:.5,disableMultiStroke:true},
  xkcd:{roughness:1.3,bowing:1.2,disableMultiStroke:true},
  excalidraw:{roughness:1,bowing:1,disableMultiStroke:false},
  drawio:{roughness:1.8,bowing:1.7,disableMultiStroke:false},
} as const
export const sketchSeed=(value:string)=>[...value].reduce((n,c)=>(n*31+c.charCodeAt(0))&0x7fffffff,17)||1
