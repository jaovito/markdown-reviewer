import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  pending: boolean;
  onSubmit: (body: string) => void;
}

export function RemoteReplyComposer({ pending, onSubmit }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody("");
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("sync.thread.replyPlaceholder")}
        rows={2}
        disabled={pending}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || body.trim().length === 0}>
          {t("sync.actions.send")}
        </Button>
      </div>
    </form>
  );
}
