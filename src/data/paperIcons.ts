import type {MaterialIcon,IconElement} from './materials.ts'
const path=(d:string):IconElement=>({tag:'path',attrs:{d,fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round'}})
const circle=(cx:number,cy:number,r:number):IconElement=>({tag:'circle',attrs:{cx:String(cx),cy:String(cy),r:String(r),fill:'none',stroke:'currentColor','stroke-width':'1.6'}})
const definitions:Array<[string,string,string[],IconElement[]]>=[
  ['search','检索搜索',['search','查询','观察'],[circle(10,10,6.5),path('M15 15L21 21')]],
  ['calculator','计算任务',['calculator','数学','计算器'],[path('M4 2H20V22H4Z M6 12H18 M12 5V9 M10 7H14 M15 7H18 M7 16L10 19 M10 16L7 19 M15 16H18 M15 19H18')]],
  ['transfer','跨任务迁移',['transfer','切换','任务'],[path('M3 3H9V9H3Z M15 15H21V21H15Z M13 5C20 5 21 9 20 12 M18 10L20 12L22 10 M11 19C4 19 3 15 4 12 M2 14L4 12L6 14')]],
  ['lock','固定锁定',['lock','frozen','冻结'],[path('M5 11H19V21H5Z M8 11V7C8 1 16 1 16 7V11')]],
  ['chat','查询与回答',['query','answer','对话','消息'],[path('M4 17L3 21L9 18C19 20 25 9 18 5C10 0 0 5 2 12C2 14 3 16 4 17') ,circle(8,11,.5),circle(12,11,.5),circle(16,11,.5)]],
  ['thought','思考',['think','thought','推理'],[path('M7 15C3 16 1 12 3 9C1 5 6 2 9 4C11 0 16 2 16 5C22 3 25 10 21 13C22 18 16 20 13 17C11 20 7 18 7 15'),circle(5,20,1.2),circle(2,23,.6)]],
  ['tool','工具调用',['tool','wrench','执行','扳手'],[path('M15 9L21 3C23 9 20 14 15 13L7 21C4 24 0 20 3 17L11 9C8 4 13 0 17 2L12 7Z')]],
  ['refresh','更新循环',['refresh','update','同步'],[path('M20 8C15-1 3 3 3 12 M3 5V12H10 M4 16C9 25 21 21 21 12 M21 19V12H14')]],
  ['fire','可训练或更新',['fire','trainable','火焰','训练'],[{tag:'path',attrs:{d:'M13 1C17 7 9 10 14 14C16 12 17 10 17 8C24 16 21 23 13 24C17 19 13 18 12 15C12 19 8 20 9 24C0 20 2 13 6 9C5 14 8 15 8 12C8 8 13 6 13 1Z',fill:'currentColor'}}]],
]
export const paperIcons:MaterialIcon[]=definitions.map(([id,name,tags,elements])=>({id:`paper:${id}`,name,category:'论文线性图标',tags:['paper','论文','线性',...tags],width:24,height:24,elements}))
