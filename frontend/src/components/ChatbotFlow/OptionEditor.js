import React, { useEffect, useRef, useState } from "react";
import { head } from "lodash";

import { makeStyles } from "@material-ui/core/styles";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField
} from "@material-ui/core";
import AttachFileIcon from "@material-ui/icons/AttachFile";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";

import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  field: { marginBottom: theme.spacing(2) },
  attachment: {
    display: "flex",
    alignItems: "center",
    marginBottom: theme.spacing(2)
  },
  spacer: { flex: 1 },
  destructive: { color: theme.palette.error.main }
}));

const emptyOption = {
  title: "",
  message: "",
  exitChatbot: false,
  forwardQueueId: ""
};

/**
 * Edição de uma opção do chatbot.
 *
 * Só devolve os campos que o usuário controla: "option" (a tecla digitada) e
 * "order" são derivados pelo backend a partir da posição entre as opções ativas.
 */
const OptionEditor = ({
  open,
  option,
  queues,
  currentQueueId,
  onClose,
  onSave,
  onDelete,
  onRemoveMedia
}) => {
  const classes = useStyles();
  const [values, setValues] = useState(emptyOption);
  const [attachment, setAttachment] = useState(null);
  const [saving, setSaving] = useState(false);
  const attachmentInput = useRef(null);

  useEffect(() => {
    if (!open) return;
    setValues({ ...emptyOption, ...(option || {}) });
    setAttachment(null);
  }, [open, option]);

  const isNew = !option?.id;

  const change = patch => setValues(prev => ({ ...prev, ...patch }));

  const handleSubmit = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(
        {
          title: values.title,
          message: values.message,
          exitChatbot: !!values.exitChatbot,
          forwardQueueId: values.forwardQueueId || null
        },
        attachment
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {isNew
            ? i18n.t("chatbotFlow.editor.addTitle")
            : i18n.t("chatbotFlow.editor.editTitle")}
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            fullWidth
            required
            variant="outlined"
            margin="dense"
            className={classes.field}
            label={i18n.t("chatbotFlow.editor.title")}
            helperText={i18n.t("chatbotFlow.editor.titleHelp")}
            value={values.title}
            onChange={event => change({ title: event.target.value })}
          />

          <TextField
            fullWidth
            multiline
            rows={5}
            spellCheck
            variant="outlined"
            margin="dense"
            className={classes.field}
            label={i18n.t("chatbotFlow.editor.message")}
            helperText={i18n.t("chatbotFlow.editor.messageHelp")}
            value={values.message || ""}
            onChange={event => change({ message: event.target.value })}
          />

          <div className={classes.attachment}>
            <input
              type="file"
              hidden
              ref={attachmentInput}
              onChange={event => setAttachment(head(event.target.files))}
            />
            {attachment || values.mediaName ? (
              <>
                <Button startIcon={<AttachFileIcon />} disabled>
                  {attachment ? attachment.name : values.mediaName}
                </Button>
                <IconButton
                  size="small"
                  color="secondary"
                  aria-label={i18n.t("chatbotFlow.editor.removeAttachment")}
                  onClick={() => {
                    if (attachment) {
                      setAttachment(null);
                      attachmentInput.current.value = null;
                      return;
                    }
                    onRemoveMedia();
                    change({ mediaName: null, mediaPath: null });
                  }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </>
            ) : (
              <Button
                startIcon={<AttachFileIcon />}
                onClick={() => attachmentInput.current.click()}
              >
                {i18n.t("chatbotFlow.editor.attach")}
              </Button>
            )}
          </div>

          <FormControlLabel
            className={classes.field}
            control={
              <Switch
                color="primary"
                checked={!!values.exitChatbot}
                disabled={!!values.forwardQueueId}
                onChange={event =>
                  change({
                    exitChatbot: event.target.checked,
                    forwardQueueId: event.target.checked
                      ? ""
                      : values.forwardQueueId
                  })
                }
              />
            }
            label={i18n.t("chatbotFlow.editor.exitChatbot")}
          />

          <FormControl fullWidth variant="outlined" margin="dense">
            <InputLabel id="forward-queue-label">
              {i18n.t("chatbotFlow.editor.forwardQueue")}
            </InputLabel>
            <Select
              labelId="forward-queue-label"
              label={i18n.t("chatbotFlow.editor.forwardQueue")}
              value={values.forwardQueueId || ""}
              disabled={!!values.exitChatbot}
              onChange={event =>
                change({
                  forwardQueueId: event.target.value,
                  exitChatbot: event.target.value ? false : values.exitChatbot
                })
              }
            >
              <MenuItem value="">
                {i18n.t("chatbotFlow.editor.noForwardQueue")}
              </MenuItem>
              {queues
                .filter(queue => queue.id !== currentQueueId)
                .map(queue => (
                  <MenuItem key={queue.id} value={queue.id}>
                    {queue.name}
                  </MenuItem>
                ))}
            </Select>
            <FormHelperText>
              {i18n.t("chatbotFlow.editor.forwardQueueHelp")}
            </FormHelperText>
          </FormControl>
        </DialogContent>
        <DialogActions>
          {!isNew && (
            <Button className={classes.destructive} onClick={onDelete}>
              {i18n.t("chatbotFlow.editor.delete")}
            </Button>
          )}
          <span className={classes.spacer} />
          <Button onClick={onClose} color="secondary" variant="outlined">
            {i18n.t("chatbotFlow.editor.cancel")}
          </Button>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={saving || !values.title.trim()}
          >
            {i18n.t("chatbotFlow.editor.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default OptionEditor;
