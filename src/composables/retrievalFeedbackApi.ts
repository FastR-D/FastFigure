export async function feedbackRequest(path:string,body?:unknown){
  let response:Response
  try{response=await fetch(path,{signal:AbortSignal.timeout(20_000),...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})}
  catch(e){if(e instanceof Error&&e.name==='TimeoutError')throw new Error('反馈请求超时；保存结果未知时可重试同一反馈或重新读取',{cause:e});throw e}
  let value:unknown;try{value=await response.json()}catch{throw new Error('本机反馈接口不可用，请通过开发或预览服务运行')}
  if(!response.ok)throw new Error(value&&typeof value==='object'&&'error'in value?String(value.error):'素材反馈请求失败')
  return value
}
