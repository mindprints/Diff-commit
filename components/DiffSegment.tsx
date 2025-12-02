
import React from 'react';
import clsx from 'clsx';
import { DiffSegment as DiffSegmentType } from '../types';

interface Props {
  segment: DiffSegmentType;
  onClick: (id: string) => void;
}

export const DiffSegment: React.FC<Props> = ({ segment, onClick }) => {
  const { type, value, isIncluded } = segment;

  if (type === 'unchanged') {
    return <span className="text-gray-700 font-light leading-relaxed">{value}</span>;
  }

  // Styles for ADDED segments
  if (type === 'added') {
    return (
      <span
        onClick={() => onClick(segment.id)}
        title={isIncluded ? "Added text. Click to reject." : "Added text (Rejected). Click to accept."}
        className={clsx(
          "cursor-pointer px-0.5 rounded transition-all duration-200 select-none border-b-2",
          isIncluded 
            ? "bg-green-100 text-green-900 border-green-500 hover:bg-green-200" 
            : "bg-gray-100 text-gray-400 border-transparent decoration-gray-400 line-through opacity-60 hover:opacity-100"
        )}
      >
        {value}
      </span>
    );
  }

  // Styles for REMOVED segments
  if (type === 'removed') {
    // If isIncluded is true, it means we "Restored" the deleted text.
    // If isIncluded is false (default), it means we accepted the deletion.
    return (
      <span
        onClick={() => onClick(segment.id)}
        title={isIncluded ? "Restored text. Click to delete." : "Deleted text. Click to restore."}
        className={clsx(
          "cursor-pointer px-0.5 rounded transition-all duration-200 select-none border-b-2",
          !isIncluded
            ? "bg-red-100 text-red-900 border-red-500 line-through hover:bg-red-200 decoration-red-500" // "Deleted" state
            : "bg-blue-50 text-blue-900 border-blue-400 border-dashed hover:bg-blue-100" // "Restored" state
        )}
      >
        {value}
      </span>
    );
  }

  return null;
};
