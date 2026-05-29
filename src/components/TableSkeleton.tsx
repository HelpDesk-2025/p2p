interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export function TableSkeleton({ columns, rows = 8 }: TableSkeletonProps) {
  return (
    <>
      {/* Desktop skeleton */}
      <div className="hidden lg:block">
        <div className="divide-y divide-slate-100">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className={`flex items-center gap-4 px-4 py-4 ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
            >
              {Array.from({ length: columns }).map((_, colIndex) => (
                <div key={colIndex} className="flex-1">
                  <div
                    className={`h-4 bg-slate-200 rounded animate-pulse ${
                      colIndex === 0 ? 'w-28' :
                      colIndex === columns - 1 ? 'w-16 mx-auto' :
                      'w-full max-w-[120px]'
                    }`}
                    style={{ animationDelay: `${(rowIndex * columns + colIndex) * 50}ms` }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile skeleton */}
      <div className="lg:hidden">
        <div className="divide-y divide-slate-200">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" style={{ animationDelay: `${rowIndex * 100}ms` }} />
                <div className="h-5 w-20 bg-slate-200 rounded-full animate-pulse" style={{ animationDelay: `${rowIndex * 100 + 50}ms` }} />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-48 bg-slate-200 rounded animate-pulse" style={{ animationDelay: `${rowIndex * 100 + 100}ms` }} />
                <div className="h-3 w-36 bg-slate-200 rounded animate-pulse" style={{ animationDelay: `${rowIndex * 100 + 150}ms` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
