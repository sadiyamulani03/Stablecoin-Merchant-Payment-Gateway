import React from "react";

export const Link = React.forwardRef<any, any>((props, ref) => {
  const { href, children, ...rest } = props;
  return React.createElement("a", Object.assign({ href, ref }, rest), children);
});
Link.displayName = "Link";
export default Link;
