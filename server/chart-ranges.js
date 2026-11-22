// Display intervals only: the spoken facts keep their original 10th/90th percentiles.
export function rangeChart(title, labels, entries) {
  const central=entries.every(([facts,key])=>facts.chartRanges?.[key]);
  const rows=entries.map(([facts,key])=>({...facts[key],...(central?facts.chartRanges[key]:{})}));
  return {kind:"range",title,labels,coverage:central?.5:.8,datasets:[
    {label:central?"25th percentile":"10th percentile",data:rows.map(row=>row.low)},
    {label:"Median",data:rows.map(row=>row.median)},
    {label:central?"75th percentile":"90th percentile",data:rows.map(row=>row.high)},
  ]};
}
