import Spinner from "../ui/spinner";

type Props = {
  title: string;
  detail: string;
  loading?: boolean;
};

function Empty({ title, detail, loading = false }: Props) {
  return (
    <div className="max-w-sm text-center">
      {loading && <Spinner label="Loading match" className="mx-auto size-7" />}
      {title && <h2 className="mt-3 text-sm font-medium text-zinc-200">{title}</h2>}
      {detail && <p className="mt-1.5 text-xs leading-5 text-zinc-500">{detail}</p>}
    </div>
  );
}

export default Empty;
