import React, { useEffect, useState } from "react";

import Accordion from "@material-ui/core/Accordion";
import AccordionDetails from "@material-ui/core/AccordionDetails";
import AccordionSummary from "@material-ui/core/AccordionSummary";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import Typography from "@material-ui/core/Typography";
import { makeStyles, Paper } from "@material-ui/core";

import MainContainer from "../../../components/MainContainer";
import MainHeader from "../../../components/MainHeader";
import Title from "../../../components/Title";
import partnerApi from "../../../services/partnerApi";
import toastError from "../../../errors/toastError";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    width: "100%",
    minHeight: "200px",
    overflowY: "scroll",
    ...theme.scrollbarStyles
  },
  heading: {
    fontSize: theme.typography.pxToRem(15),
    flexBasis: "33.33%",
    flexShrink: 0
  },
  secondaryHeading: {
    fontSize: theme.typography.pxToRem(15),
    color: theme.palette.text.secondary
  },
  empty: {
    padding: theme.spacing(2)
  }
}));

const PartnerAjuda = () => {
  const classes = useStyles();
  const [records, setRecords] = useState([]);

  useEffect(() => {
    partnerApi
      .get("/partner/helps")
      .then(({ data }) => setRecords(data))
      .catch(toastError);
  }, []);

  const renderVideo = record => (
    <iframe
      style={{ width: "100%", maxWidth: 700, height: 400 }}
      src={`https://www.youtube.com/embed/${record.video}`}
      title={record.title}
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );

  return (
    <MainContainer>
      <MainHeader>
        <Title>Ajuda e treinamentos</Title>
      </MainHeader>
      <Paper className={classes.mainPaper} variant="outlined">
        {records.length === 0 && (
          <Typography className={classes.empty}>
            Nenhum material disponível no momento.
          </Typography>
        )}
        {records.map(record => (
          <Accordion key={record.id}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography className={classes.heading}>
                {record.title}
              </Typography>
              <Typography className={classes.secondaryHeading}>
                {record.description}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {record.video ? renderVideo(record) : null}
              {record.link ? (
                <Typography>
                  <a href={record.link} target="_blank" rel="noreferrer">
                    {record.link}
                  </a>
                </Typography>
              ) : null}
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>
    </MainContainer>
  );
};

export default PartnerAjuda;
