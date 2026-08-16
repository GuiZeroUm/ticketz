import React from "react";
import {
  Box,
  Breadcrumbs,
  Card,
  CardActionArea,
  Link,
  Typography,
  makeStyles
} from "@material-ui/core";
import DescriptionIcon from "@material-ui/icons/Description";
import PlayCircleOutlineIcon from "@material-ui/icons/PlayCircleOutline";

import { i18n } from "../../translate/i18n";
import { getIconComponent } from "../IconPicker/icons";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(2)
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(3)
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: theme.shape.borderRadius,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.primary.main
  },
  section: {
    marginBottom: theme.spacing(4)
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1.5)
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: theme.spacing(2)
  },
  thumb: {
    width: "100%",
    aspectRatio: "16 / 9",
    objectFit: "cover",
    display: "block",
    backgroundColor: theme.palette.action.hover
  },
  cardBody: {
    padding: theme.spacing(1.5),
    textAlign: "left",
    width: "100%"
  },
  meta: {
    color: theme.palette.text.secondary
  },
  articleCard: {
    padding: theme.spacing(2),
    textAlign: "left",
    width: "100%"
  },
  empty: {
    color: theme.palette.text.secondary
  }
}));

const YOUTUBE_THUMB = video =>
  `https://img.youtube.com/vi/${video}/hqdefault.jpg`;

const CategoryDetail = ({ group, onBack, onOpenArticle }) => {
  const classes = useStyles();
  const Icon = getIconComponent(group.icon);

  const openVideo = video => {
    const url = video.video
      ? `https://www.youtube.com/watch?v=${video.video}`
      : video.link;

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Box className={classes.root}>
      <Breadcrumbs>
        <Link
          color="inherit"
          href="#"
          onClick={event => {
            event.preventDefault();
            onBack();
          }}
        >
          {i18n.t("helps.title")}
        </Link>
        <Typography color="textPrimary">{group.title}</Typography>
      </Breadcrumbs>

      <Box className={classes.header}>
        <Box className={classes.iconBox}>
          <Icon fontSize="large" />
        </Box>
        <Box>
          <Typography variant="h5">{group.title}</Typography>
          {group.subtitle ? (
            <Typography variant="body2" className={classes.meta}>
              {group.subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>

      {group.videos.length ? (
        <Box className={classes.section}>
          <Box className={classes.sectionTitle}>
            <PlayCircleOutlineIcon color="primary" />
            <Typography variant="h6">{i18n.t("helps.videos")}</Typography>
          </Box>
          <Box className={classes.grid}>
            {group.videos.map(video => (
              <Card key={video.id} variant="outlined">
                <CardActionArea onClick={() => openVideo(video)}>
                  {video.video ? (
                    <img
                      className={classes.thumb}
                      src={YOUTUBE_THUMB(video.video)}
                      alt={video.title}
                    />
                  ) : null}
                  <Box className={classes.cardBody}>
                    <Typography variant="subtitle1">{video.title}</Typography>
                    {video.description ? (
                      <Typography variant="body2" className={classes.meta}>
                        {video.description}
                      </Typography>
                    ) : null}
                    {video.duration ? (
                      <Typography variant="caption" className={classes.meta}>
                        {video.duration}
                      </Typography>
                    ) : null}
                  </Box>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      ) : null}

      {group.articles.length ? (
        <Box className={classes.section}>
          <Box className={classes.sectionTitle}>
            <DescriptionIcon color="primary" />
            <Typography variant="h6">{i18n.t("helps.articles")}</Typography>
          </Box>
          <Box className={classes.grid}>
            {group.articles.map(article => (
              <Card key={article.id} variant="outlined">
                <CardActionArea onClick={() => onOpenArticle(article)}>
                  <Box className={classes.articleCard}>
                    <Typography variant="subtitle1">{article.title}</Typography>
                    {article.description ? (
                      <Typography variant="body2" className={classes.meta}>
                        {article.description}
                      </Typography>
                    ) : null}
                  </Box>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      ) : null}

      {!group.videos.length && !group.articles.length ? (
        <Typography className={classes.empty}>
          {i18n.t("helps.emptyGroup")}
        </Typography>
      ) : null}
    </Box>
  );
};

export default CategoryDetail;
