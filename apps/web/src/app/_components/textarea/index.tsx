import React from "react";
import ReactTextareaAutosize from "react-textarea-autosize";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    currentValueLength?: number;
  };

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, currentValueLength, ...rest }, ref) => {
    return (
      <>
        <ReactTextareaAutosize
          className={`rounded-md px-2 py-1 ${className}`}
          ref={ref}
          {...rest}
          style={{}}
        />
        {currentValueLength && <p>{currentValueLength}</p>}
      </>
    );
  },
);
Textarea.displayName = "Textarea";
