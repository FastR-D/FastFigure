import type {FigureContainer} from './model.ts'
export const containerSurfaces=['plain','hatch','transparent'] as const
export type ContainerSurface=typeof containerSurfaces[number]
export const containerSurfaceLabels={plain:'纯色底',hatch:'斜线底纹',transparent:'透明'} as const
export const containerSurfaceOptions=containerSurfaces.map(surface=>({value:surface,label:containerSurfaceLabels[surface]}))
export function containerSurface(container:Pick<FigureContainer,'visual'>):ContainerSurface{return container.visual?.fill==='none'?'transparent':container.visual?.tone==='hatch'?'hatch':'plain'}
export function setContainerSurface(container:FigureContainer,surface:ContainerSurface){
  container.visual={...container.visual,tone:surface==='hatch'?'hatch':'fill'}
  if(surface==='transparent')container.visual.fill='none'
  else if(container.visual.fill==='none')delete container.visual.fill
}
