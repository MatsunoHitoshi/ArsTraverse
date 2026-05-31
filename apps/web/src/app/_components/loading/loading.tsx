import ClipLoader from "react-spinners/ClipLoader";

type LoadingProps = {
  color: string;
  size: number;
};

export const Loading = ({ color, size }: LoadingProps) => {
  return <ClipLoader color={color} size={size} />;
};
