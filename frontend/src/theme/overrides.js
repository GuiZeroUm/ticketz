// Ajustes globais de componentes do Material-UI.
//
// MuiInputLabel.outlined: o contorno do campo (legend) é dimensionado para o
// rótulo em uma única linha. Sem isto, o rótulo flutuante quebra linha em
// campos estreitos e fica por cima do valor selecionado.
const themeOverrides = {
  MuiInputLabel: {
    outlined: {
      "&$shrink": {
        whiteSpace: "nowrap"
      }
    }
  }
};

export default themeOverrides;
