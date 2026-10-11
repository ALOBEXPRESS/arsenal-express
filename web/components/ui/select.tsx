export const Select = ({children,value,onValueChange,disabled}:any) => <select value={value} onChange={e=>onValueChange(e.target.value)} disabled={disabled} className="border rounded px-2 py-1">{children}</select>
export const SelectTrigger = ({children}:any) => <>{children}</>
export const SelectValue = () => null
export const SelectContent = ({children}:any) => <>{children}</>
export const SelectItem = ({value,children}:any) => <option value={value}>{children}</option>
