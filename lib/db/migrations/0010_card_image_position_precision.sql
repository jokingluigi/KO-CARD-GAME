ALTER TABLE "cards"
  ALTER COLUMN "image_position_x" TYPE real USING "image_position_x"::real,
  ALTER COLUMN "image_position_y" TYPE real USING "image_position_y"::real;

ALTER TABLE "card_skin_definitions"
  ALTER COLUMN "image_position_x" TYPE real USING "image_position_x"::real,
  ALTER COLUMN "image_position_y" TYPE real USING "image_position_y"::real;