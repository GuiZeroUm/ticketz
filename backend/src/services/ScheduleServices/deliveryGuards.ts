import ScheduleDelivery from "../../models/ScheduleDelivery";

// A entrega agendada só sai por WhatsApp. Se o contato perdeu (ou nunca teve)
// o telefone, a entrega vira falha com um código estável em vez de lançar
// exceção no job e deixar o lote preso. Retorna true quando bloqueou.
export const failDeliveryWithoutPhone = async (
  delivery: ScheduleDelivery
): Promise<boolean> => {
  if (delivery.contact?.number) return false;
  await delivery.update({
    status: "ERROR",
    errorMessage: "ERR_CONTACT_HAS_NO_PHONE"
  });
  return true;
};
