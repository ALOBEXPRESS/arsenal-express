export function Alert({children,variant,...rest}:any){return <div className={`p-3 rounded border ${variant==='destructive'?'border-red-500 bg-red-50':'border-border bg-surface-2'}`} {...rest}>{children}</div>}
export function AlertDescription({children}:any){return <p className="text-sm">{children}</p>}
