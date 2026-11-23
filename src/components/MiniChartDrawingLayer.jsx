import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, MoveVertical, Square, Type, Layers, Undo2, Trash2, X, Pencil, Check } from 'lucide-react';
import { useStore } from '../store';

const EMPTY = [];
const TOOLS = [
  { key: 'horizontal', title: 'Horizontal line', Icon: Minus },
  { key: 'vertical', title: 'Vertical line', Icon: MoveVertical },
  { key: 'trendline', title: 'Trendline', Icon: null },
  { key: 'rectangle', title: 'Rectangle', Icon: Square },
  { key: 'fibonacci', title: 'Fibonacci', Icon: Layers },
  { key: 'text', title: 'Text note', Icon: Type },
];
let activeMiniChartId = null;
const COLORS = ['#ffffff','#ef5350','#26a69a','#3b82f6','#f59e0b','#a855f7','#22c55e','#06b6d4','#eab308','#f43f5e','#84cc16','#ec4899'];
const distanceToSegment = (px, py, a, b) => {
  const dx=b.x-a.x, dy=b.y-a.y, len=dx*dx+dy*dy;
  const t=len ? Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/len)) : 0;
  return Math.hypot(px-(a.x+t*dx),py-(a.y+t*dy));
};

export default function MiniChartDrawingLayer({ chartRef, seriesRef, chartReady, chartId, candles = EMPTY, timeframe = 1, containerRef }) {
  const canvasRef = useRef(null);
  const toolRef = useRef(null);
  const selectedRef = useRef(null);
  const dragRef = useRef(null);
  const draftRef = useRef(null);
  const drawingsRef = useRef(EMPTY);
  const candlesRef = useRef(candles);
  const timeframeRef = useRef(timeframe);
  const stylesRef = useRef(null);
  const rafRef = useRef(0);
  const historyRef = useRef([]);
  const [tool, setToolState] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drawings, setDrawingsState] = useState(EMPTY);
  const [panelOpen, setPanelOpen] = useState(false);

  const readDrawings = useCallback(() => useStore.getState().chartDrawings?.[chartId] || EMPTY, [chartId]);
  const writeDrawings = useCallback((next) => {
    const current = readDrawings();
    const resolved = typeof next === 'function' ? next(current) : next;
    useStore.getState().setChartDrawings(chartId, resolved);
  }, [chartId, readDrawings]);

  toolRef.current = tool;
  selectedRef.current = selectedId;
  drawingsRef.current = drawings;
  candlesRef.current = candles;
  timeframeRef.current = timeframe;
  stylesRef.current = useStore.getState().drawingStyles;

  const pointAt = useCallback((x, y) => {
    const chart = chartRef.current, series = seriesRef.current, data = candlesRef.current;
    if (!chart || !series || !data.length) return null;
    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (logical == null || price == null || !Number.isFinite(Number(price))) return null;
    const lo = Math.max(0, Math.min(data.length - 1, Math.floor(logical)));
    const hi = Math.max(0, Math.min(data.length - 1, lo + 1));
    let time;
    if (logical < 0) {
      const step = data.length > 1 ? Number(data[1].time)-Number(data[0].time) : Number(timeframeRef.current)*60;
      time = Number(data[0].time) + logical * Math.max(1,step);
    } else if (logical > data.length - 1) {
      const step = data.length > 1 ? Number(data[data.length-1].time)-Number(data[data.length-2].time) : Number(timeframeRef.current)*60;
      time = Number(data[data.length-1].time) + (logical-(data.length-1))*Math.max(1,step);
    } else {
      const fraction = logical - lo;
      time = Number(data[lo].time) + (Number(data[hi].time)-Number(data[lo].time))*fraction;
    }
    return Number.isFinite(time) ? { time, price: Number(price) } : null;
  }, [chartRef, seriesRef]);

  // Convert timestamps to logical bar coordinates. Using the chart's logical
  // scale keeps drawings locked to candles during every pan and zoom gesture.
  const xyAt = useCallback((point) => {
    const chart = chartRef.current, series = seriesRef.current, data = candlesRef.current;
    if (!chart || !series || !data.length) return null;
    const target = Number(point.time);
    let logical;
    if (data.length === 1) {
      const step = Math.max(1,Number(timeframeRef.current))*60;
      logical = (target-Number(data[0].time))/step;
    } else if (target <= Number(data[0].time)) {
      const step = Number(data[1].time)-Number(data[0].time);
      logical = (target-Number(data[0].time))/Math.max(1,step);
    } else if (target >= Number(data[data.length-1].time)) {
      const n=data.length, step=Number(data[n-1].time)-Number(data[n-2].time);
      logical=n-1+(target-Number(data[n-1].time))/Math.max(1,step);
    } else {
      let lo=0, hi=data.length-1;
      while(hi-lo>1){const mid=(lo+hi)>>1;if(Number(data[mid].time)<target)lo=mid;else hi=mid;}
      const t1=Number(data[lo].time), t2=Number(data[hi].time);
      logical=lo+(hi-lo)*((target-t1)/(t2-t1));
    }
    const x=chart.timeScale().logicalToCoordinate(logical);
    const y=series.priceToCoordinate(Number(point.price));
    return x==null||y==null||!Number.isFinite(x)||!Number.isFinite(y)?null:{x,y};
  }, [chartRef, seriesRef]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const canvas=canvasRef.current;
      if(!canvas) return;
      const rect=canvas.getBoundingClientRect();
      const dpr=window.devicePixelRatio||1;
      const width=Math.max(1,Math.round(rect.width*dpr)), height=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      const ctx=canvas.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,rect.width,rect.height);
      const paint=(drawing,preview=false)=>{
        const pts=(drawing.points||[]).map(xyAt);
        if(!pts.length||pts.some(p=>!p)) return;
        const color=drawing.color||drawing.borderColor||'#f59e0b';
        ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=drawing.fillColor||'#f59e0b33';
        ctx.lineWidth=Math.max(1,Number(drawing.lineWidth)||1);
        ctx.setLineDash(preview?[4,3]:[]);
        if(drawing.type==='horizontal'){ctx.beginPath();ctx.moveTo(0,pts[0].y);ctx.lineTo(rect.width,pts[0].y);ctx.stroke();}
        else if(drawing.type==='vertical'){ctx.beginPath();ctx.moveTo(pts[0].x,0);ctx.lineTo(pts[0].x,rect.height);ctx.stroke();}
        else if(drawing.type==='text'){ctx.fillStyle=color;ctx.font=`${drawing.fontSize||14}px ${drawing.fontFamily||'sans-serif'}`;ctx.textBaseline='bottom';ctx.fillText(drawing.text||'',pts[0].x,pts[0].y);}
        else if(pts.length===2&&drawing.type==='trendline'){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);ctx.lineTo(pts[1].x,pts[1].y);ctx.stroke();}
        else if(pts.length===2&&drawing.type==='rectangle'){
          const x=Math.min(pts[0].x,pts[1].x), y=Math.min(pts[0].y,pts[1].y), w=Math.abs(pts[1].x-pts[0].x), h=Math.abs(pts[1].y-pts[0].y);
          ctx.fillRect(x,y,w,h); if(drawing.showBorder===true)ctx.strokeRect(x,y,w,h);
        } else if(pts.length===2&&drawing.type==='fibonacci'){
          const x=Math.min(pts[0].x,pts[1].x), w=Math.abs(pts[1].x-pts[0].x);
          ctx.fillRect(x,Math.min(pts[0].y,pts[1].y),w,Math.abs(pts[1].y-pts[0].y));
          if(drawing.showBorder===true)[0,.5,.618,.764,1].forEach(level=>{const y=pts[0].y+(pts[1].y-pts[0].y)*level;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.stroke();ctx.fillStyle=color;ctx.font='10px sans-serif';ctx.fillText(`${(level*100).toFixed(1)}%`,x+w+4,y-2);});
        }
        ctx.restore();
      };
      drawingsRef.current.forEach(d=>paint(d));
      if(draftRef.current)paint(draftRef.current,true);
      const selected=drawingsRef.current.find(d=>d.id===selectedRef.current);
      if(selected){
        const pts=(selected.points||[]).map(xyAt).filter(Boolean);
        ctx.save();ctx.strokeStyle='#2563eb';ctx.fillStyle='#ffffff';ctx.lineWidth=1;ctx.setLineDash([3,3]);
        if(selected.type==='rectangle'&&pts.length===2){ctx.strokeRect(Math.min(pts[0].x,pts[1].x),Math.min(pts[0].y,pts[1].y),Math.abs(pts[1].x-pts[0].x),Math.abs(pts[1].y-pts[0].y));}
        else if(selected.type==='trendline'&&pts.length===2){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);ctx.lineTo(pts[1].x,pts[1].y);ctx.stroke();}
        else if(selected.type==='horizontal'&&pts[0]){ctx.beginPath();ctx.moveTo(0,pts[0].y);ctx.lineTo(rect.width,pts[0].y);ctx.stroke();}
        else if(selected.type==='vertical'&&pts[0]){ctx.beginPath();ctx.moveTo(pts[0].x,0);ctx.lineTo(pts[0].x,rect.height);ctx.stroke();}
        pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();});
        ctx.restore();
      }
    });
  }, [xyAt]);

  useEffect(() => {
    setDrawingsState(readDrawings());
    const unsubscribe=useStore.subscribe((state,prev)=>{
      const next=state.chartDrawings?.[chartId]||EMPTY;
      if(next!==prev.chartDrawings?.[chartId]){setDrawingsState(next);drawingsRef.current=next;scheduleDraw();}
      if(state.drawingStyles!==prev.drawingStyles){stylesRef.current=state.drawingStyles;scheduleDraw();}
    });
    return unsubscribe;
  }, [chartId, readDrawings, scheduleDraw]);

  useEffect(() => { scheduleDraw(); }, [candles, timeframe, scheduleDraw]);

  useEffect(() => {
    if(!chartReady||!canvasRef.current) return undefined;
    const chart=chartRef.current, canvas=canvasRef.current;
    if(!chart) return undefined;
    const timeScale=chart.timeScale(), priceScale=chart.priceScale('right');
    const observer=new ResizeObserver(scheduleDraw); observer.observe(canvas);
    timeScale.subscribeVisibleLogicalRangeChange(scheduleDraw);
    priceScale.subscribeVisiblePriceRangeChange?.(scheduleDraw);
    chart.subscribeSizeChange?.(scheduleDraw);
    const onMove=()=>scheduleDraw();
    window.addEventListener('pointermove',onMove,{passive:true});
    window.addEventListener('wheel',onMove,{passive:true});
    scheduleDraw();
    return ()=>{
      observer.disconnect();
      timeScale.unsubscribeVisibleLogicalRangeChange(scheduleDraw);
      priceScale.unsubscribeVisiblePriceRangeChange?.(scheduleDraw);
      chart.unsubscribeSizeChange?.(scheduleDraw);
      window.removeEventListener('pointermove',onMove);
      window.removeEventListener('wheel',onMove);
      if(rafRef.current)cancelAnimationFrame(rafRef.current);
    };
  },[chartReady,chartRef,scheduleDraw]);

  const getHit=(x,y)=>{
    const items=drawingsRef.current;
    for(let i=items.length-1;i>=0;i--){
      const d=items[i], pts=(d.points||[]).map(xyAt);
      if(!pts.length||pts.some(p=>!p))continue;
      if(d.type==='text'){
        const ctx=canvasRef.current?.getContext('2d'); if(!ctx)continue;
        ctx.font=`${d.fontSize||14}px ${d.fontFamily||'sans-serif'}`;
        const w=ctx.measureText(d.text||'').width,h=d.fontSize||14;
        if(x>=pts[0].x-8&&x<=pts[0].x+w+8&&y>=pts[0].y-h-8&&y<=pts[0].y+8)return {id:d.id,mode:'body'};
      } else if(d.type==='horizontal'&&Math.abs(y-pts[0].y)<9)return {id:d.id,mode:'body'};
      else if(d.type==='vertical'&&Math.abs(x-pts[0].x)<9)return {id:d.id,mode:'body'};
      else if(d.type==='trendline'&&pts.length===2&&distanceToSegment(x,y,pts[0],pts[1])<10)return {id:d.id,mode:'body'};
      else if((d.type==='rectangle'||d.type==='fibonacci')&&pts.length===2){
        const x1=Math.min(pts[0].x,pts[1].x),x2=Math.max(pts[0].x,pts[1].x),y1=Math.min(pts[0].y,pts[1].y),y2=Math.max(pts[0].y,pts[1].y);
        if(x>=x1-8&&x<=x2+8&&y>=y1-8&&y<=y2+8)return {id:d.id,mode:'body'};
      }
      for(let j=0;j<pts.length;j++)if(Math.hypot(x-pts[j].x,y-pts[j].y)<12)return {id:d.id,mode:'point',pointIndex:j};
    }
    return null;
  };

  const setTool=(value)=>{toolRef.current=value;setToolState(value);};
  const pushHistory=()=>{historyRef.current.push(readDrawings().map(d=>({...d,points:d.points.map(p=>({...p}))})));if(historyRef.current.length>40)historyRef.current.shift();};

  useEffect(()=>{
    const container=containerRef?.current;
    if(!container||!chartReady)return undefined;
    const local=(e)=>{const r=container.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
    const down=(e)=>{
      activeMiniChartId=chartId;
      if(e.button!==0)return;
      const {x,y}=local(e), active=toolRef.current;
      const hit=getHit(x,y);
      if(!active&&!hit)return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      try{container.setPointerCapture(e.pointerId);}catch{}
      if(active==='text'){
        const p=pointAt(x,y);if(p){const text=window.prompt('Enter chart note:');if(text?.trim()){pushHistory();writeDrawings(a=>[...a,{id:Date.now()+Math.random(),type:'text',points:[p],text:text.trim(),color:'#f59e0b',lineWidth:1}]);}}
        setTool(null);return;
      }
      if(active==='horizontal'||active==='vertical'){
        const p=pointAt(x,y);if(p){pushHistory();const style=stylesRef.current?.[active]||{};writeDrawings(a=>[...a,{id:Date.now()+Math.random(),type:active,points:[p],color:style.color||'#f59e0b',lineWidth:style.lineWidth||1}]);}
        setTool(null);return;
      }
      if(active){
        const p=pointAt(x,y);if(!p)return;
        dragRef.current={kind:'create',type:active,start:p};draftRef.current={type:active,points:[p,p],color:'#f59e0b',lineWidth:1,fillColor:'#f59e0b33',showBorder:false};scheduleDraw();return;
      }
      setSelectedId(hit.id);selectedRef.current=hit.id;setPanelOpen(true);
      const item=readDrawings().find(d=>d.id===hit.id);
      const p=pointAt(x,y);
      if(item&&p){pushHistory();dragRef.current={kind:'move',mode:hit.mode,id:hit.id,pointIndex:hit.pointIndex,start:p,original:item.points.map(v=>({...v}))};}
      scheduleDraw();
    };
    const move=(e)=>{
      const drag=dragRef.current;if(!drag)return;
      const {x,y}=local(e),p=pointAt(x,y);if(!p)return;
      e.preventDefault();
      if(drag.kind==='create'){
        draftRef.current={type:drag.type,points:[drag.start,p],color:'#f59e0b',lineWidth:1,fillColor:'#f59e0b33',showBorder:false};
      }else{
        const dx=p.time-drag.start.time,dy=p.price-drag.start.price;
        const updated=drag.original.map((v,i)=>{
          if(drag.mode==='point')return i===drag.pointIndex?p:v;
          if(drag.mode==='body'){
            if(drag.original.length===1)return drag.id&&readDrawings().find(d=>d.id===drag.id)?.type==='horizontal'?{...v,price:p.price}:{...v,time:p.time};
            return {...v,time:v.time+dx,price:v.price+dy};
          }
          return v;
        });
        writeDrawings(items=>items.map(d=>d.id===drag.id?{...d,points:updated}:d));
      }
      scheduleDraw();
    };
    const up=()=>{
      const drag=dragRef.current;if(!drag)return;
      if(drag.kind==='create'&&draftRef.current){
        const points=draftRef.current.points;
        const a=xyAt(points[0]),b=xyAt(points[1]);
        if(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)>4){pushHistory();writeDrawings(items=>[...items,{id:Date.now()+Math.random(),...draftRef.current}]);}
        draftRef.current=null;setTool(null);
      }
      dragRef.current=null;scheduleDraw();
    };
    container.addEventListener('pointerdown',down,true);
    window.addEventListener('pointermove',move,true);
    window.addEventListener('pointerup',up,true);
    window.addEventListener('pointercancel',up,true);
    const key=(e)=>{
      if(activeMiniChartId===chartId&&(e.key==='Delete'||e.key==='Backspace')&&selectedRef.current!=null&&!['INPUT','TEXTAREA'].includes(e.target?.tagName)){
        e.preventDefault();pushHistory();writeDrawings(items=>items.filter(d=>d.id!==selectedRef.current));setSelectedId(null);selectedRef.current=null;setPanelOpen(false);scheduleDraw();
      }
      if(e.key==='Escape'){setTool(null);draftRef.current=null;dragRef.current=null;scheduleDraw();}
    };
    window.addEventListener('keydown',key);
    return()=>{
      container.removeEventListener('pointerdown',down,true);
      window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);
      window.removeEventListener('pointercancel',up,true);window.removeEventListener('keydown',key);
    };
  },[chartReady,chartId,containerRef,pointAt,xyAt,scheduleDraw,writeDrawings,readDrawings]);

  const patchSelected=(patch)=>{pushHistory();writeDrawings(items=>items.map(d=>d.id===selectedId?{...d,...patch}:d));};
  const deleteSelected=()=>{if(selectedId==null)return;pushHistory();writeDrawings(items=>items.filter(d=>d.id!==selectedId));setSelectedId(null);selectedRef.current=null;setPanelOpen(false);scheduleDraw();};
  const undo=()=>{const prev=historyRef.current.pop();if(prev){writeDrawings(prev);setSelectedId(null);selectedRef.current=null;setPanelOpen(false);}};
  const selected=drawings.find(d=>d.id===selectedId);

  return (
    <>
      <div className="absolute left-0 top-0 z-[100] flex flex-col gap-0.5 rounded-r-md bg-[#131722]/95 p-1 shadow-none pointer-events-auto" onPointerDown={e=>{activeMiniChartId=chartId;e.stopPropagation();}}>
        {TOOLS.map(({key,title,Icon})=><button key={key} type="button" title={title} aria-label={title} aria-pressed={tool===key} onClick={()=>setTool(tool===key?null:key)} className={`flex h-7 w-7 items-center justify-center rounded ${tool===key?'bg-blue-600 text-white':'text-gray-300 hover:bg-[#2a2e39]'}`}>
          {Icon?<Icon size={14}/>:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20 20 4M14 4h6v6"/></svg>}
        </button>)}
        <div className="my-0.5 border-t border-[#2a2e39]"/>
        <button type="button" title="Undo this chart's last drawing" disabled={!historyRef.current.length} onClick={undo} className="flex h-7 w-7 items-center justify-center rounded text-gray-300 hover:bg-[#2a2e39] disabled:opacity-30"><Undo2 size={14}/></button>
        <button type="button" title="Clear this chart's drawings" disabled={!drawings.length} onClick={()=>{pushHistory();writeDrawings(EMPTY);setSelectedId(null);selectedRef.current=null;setPanelOpen(false);scheduleDraw();}} className="flex h-7 w-7 items-center justify-center rounded text-red-400 hover:bg-red-900/30 disabled:opacity-30"><Trash2 size={14}/></button>
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 z-[90] pointer-events-none" style={{width:'100%',height:'100%'}}/>
      {selected&&panelOpen&&createPortal(
        <div className="fixed right-3 top-24 z-[10050] w-56 rounded-lg border border-[#2a2e39] bg-[#131722] p-3 text-white shadow-none" onPointerDown={e=>e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold uppercase">Drawing style</span><button onClick={()=>setPanelOpen(false)}><X size={14}/></button></div>
          <div className="mb-2 text-[10px] text-gray-400">Line color</div>
          <div className="grid grid-cols-6 gap-1">{COLORS.map(color=><button key={color} onClick={()=>patchSelected({color,borderColor:color})} title={color} className="h-6 rounded" style={{background:color}}/>)}</div>
          <div className="my-2 flex items-center gap-2"><input aria-label="Custom drawing color" type="color" value={(selected.color||'#f59e0b').slice(0,7)} onChange={e=>patchSelected({color:e.target.value,borderColor:e.target.value})}/><input aria-label="Drawing color hex" className="min-w-0 flex-1 rounded border border-[#394150] bg-[#1e222d] px-2 py-1 text-xs" value={selected.color||'#f59e0b'} onChange={e=>{if(/^#[0-9a-fA-F]{6}$/.test(e.target.value))patchSelected({color:e.target.value,borderColor:e.target.value});}}/></div>
          {['rectangle','fibonacci'].includes(selected.type)&&<><div className="mb-1 text-[10px] text-gray-400">Fill color</div><input className="w-full" type="color" value={(selected.fillColor||'#f59e0b33').slice(0,7)} onChange={e=>patchSelected({fillColor:e.target.value+'33'})}/><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.showBorder===true} onChange={e=>patchSelected({showBorder:e.target.checked})}/> Show border</label></>}
          <div className="my-2 flex items-center gap-2 text-xs"><span>Width</span><input className="flex-1" type="range" min="1" max="6" value={selected.lineWidth||1} onChange={e=>patchSelected({lineWidth:Number(e.target.value)})}/><span>{selected.lineWidth||1}px</span></div>
          {selected.type==='text'&&<button className="mb-2 w-full rounded bg-blue-600 py-1 text-xs" onClick={()=>{const value=window.prompt('Edit chart note',selected.text||'');if(value!=null)patchSelected({text:value});}}>Edit text</button>}
          <div className="flex gap-2"><button className="flex-1 rounded bg-red-600 py-1.5 text-xs" onClick={deleteSelected}><Trash2 size={12} className="mr-1 inline"/>Delete</button><button className="flex-1 rounded bg-[#303746] py-1.5 text-xs" onClick={()=>setPanelOpen(false)}>Close</button></div>
        </div>,document.body
      )}
      {selected&&<div className="absolute right-3 top-3 z-[101] flex items-center gap-1 rounded bg-[#131722]/95 px-2 py-1 text-[10px] text-white pointer-events-auto"><Pencil size={11}/> Selected <button onClick={deleteSelected} title="Delete selected drawing" className="ml-1 text-red-400"><Trash2 size={12}/></button><button onClick={()=>setPanelOpen(true)} title="Edit style" className="text-blue-400"><Check size={12}/></button></div>}
    </>
  );
}
