const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;

// Import du model User et Offer
const User = require("../models/User");
const Offer = require("../models/Offer");

// Import du middleware isAuthenticated
const isAuthenticated = require("../middleware/isAuthenticated");

// Route qui nous permet de récupérer une liste d'annonces, en fonction de filtres
router.get("/offers", async (req, res) => {
  try {
    // création d'un objet dans lequel on va sotcker nos différents filtres
    let filters = {};

    if (req.query.title) {
      filters.product_name = new RegExp(req.query.title, "i");
    }

    if (req.query.priceMin) {
      filters.product_price = {
        $gte: req.query.priceMin,
      };
    }

    if (req.query.priceMax) {
      if (filters.product_price) {
        filters.product_price.$lte = req.query.priceMax;
      } else {
        filters.product_price = {
          $lte: req.query.priceMax,
        };
      }
    }

    let sort = {};

    if (req.query.sort === "price-desc") {
      sort = { product_price: -1 };
    } else if (req.query.sort === "price-asc") {
      sort = { product_price: 1 };
    }

    let page;
    if (Number(req.query.page) < 1) {
      page = 1;
    } else {
      page = Number(req.query.page);
    }

    let limit = Number(req.query.limit);

    const offers = await Offer.find(filters)
      .populate({
        path: "owner",
        select: "account",
      })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);

    // cette ligne va nous retourner le nombre d'annonces trouvées en fonction des filtres
    const count = await Offer.countDocuments(filters);
    res.json({
      count: count,
      offers: offers,
    });
  } catch (error) {
    console.log(error.message);
    res.status(400).json({ message: error.message });
  }
});

// Route qui permmet de récupérer les informations d'une offre en fonction de son id
router.get("/offer/:id", async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id).populate({
      path: "owner",
      select: "account.username account.phone account.avatar",
    });
    res.json(offer);
  } catch (error) {
    console.log(error.message);
    res.status(400).json({ message: error.message });
  }
});

// Route qui permet de poster une nouvelle annonce
router.post("/offer/publish", isAuthenticated, async (req, res) => {
  try {
    const { title, description, price, brand, size, condition, color, city } =
      req.fields;

    if (title && price && req.files.picture.path) {
      // Création de la nouvelle annonce (sans l'image)
      const newOffer = new Offer({
        product_name: title,
        product_description: description,
        product_price: price,
        product_details: [
          { MARQUE: brand },
          { TAILLE: size },
          { ÉTAT: condition },
          { COULEUR: color },
          { EMPLACEMENT: city },
        ],
        owner: req.user,
      });

      // Envoi de l'image à cloudinary
      const result = await cloudinary.uploader.unsigned_upload(
        req.files.picture.path,
        "vinted_upload",
        {
          folder: `api/vinted/offers/${newOffer._id}`,
          public_id: "preview",
          cloud_name: "lereacteur",
        }
      );

      // ajout de l'image dans newOffer
      newOffer.product_image = result;
      await newOffer.save();
      res.json(newOffer);
    } else {
      res
        .status(400)
        .json({ message: "title, price and picture are required" });
    }
  } catch (error) {
    console.log(error.message);
    res.status(400).json({ message: error.message });
  }
});

// Route qui permet de modifier une offre
router.put("/offer/update/:id", isAuthenticated, async (req, res) => {
  const offerToModify = await Offer.findById(req.params.id);
  try {
    if (req.fields.title) {
      offerToModify.product_name = req.fields.title;
    }
    if (req.fields.description) {
      offerToModify.product_description = req.fields.description;
    }
    if (req.fields.price) {
      offerToModify.product_price = req.fields.price;
    }

    const details = offerToModify.product_details;
    for (i = 0; i < details.length; i++) {
      if (details[i].MARQUE) {
        if (req.fields.brand) {
          details[i].MARQUE = req.fields.brand;
        }
      }
      if (details[i].TAILLE) {
        if (req.fields.size) {
          details[i].TAILLE = req.fields.size;
        }
      }
      if (details[i].ÉTAT) {
        if (req.fields.condition) {
          details[i].ÉTAT = req.fields.condition;
        }
      }
      if (details[i].COULEUR) {
        if (req.fields.color) {
          details[i].COULEUR = req.fields.color;
        }
      }
      if (details[i].EMPLACEMENT) {
        if (req.fields.location) {
          details[i].EMPLACEMENT = req.fields.location;
        }
      }
    }

    // Notifie Mongoose que l'on a modifié le tableau product_details
    offerToModify.markModified("product_details");

    if (req.files.picture) {
      const result = await cloudinary.uploader.upload(req.files.picture.path, {
        public_id: `api/vinted/offers/${offerToModify._id}/preview`,
      });
      offerToModify.product_image = result;
    }

    await offerToModify.save();

    res.status(200).json("Offer modified succesfully !");
  } catch (error) {
    console.log(error.message);
    res.status(400).json({ error: error.message });
  }
});

//Route qui permet de supprimer une offre
router.delete("/offer/delete/:id", isAuthenticated, async (req, res) => {
  try {
    //Je supprime ce qui il y a dans le dossier
    await cloudinary.api.delete_resources_by_prefix(
      `api/vinted/offers/${req.params.id}`
    );
    //Une fois le dossier vide, je peux le supprimer !
    await cloudinary.api.delete_folder(`api/vinted/offers/${req.params.id}`);

    offerToDelete = await Offer.findById(req.params.id);

    await offerToDelete.delete();

    res.status(200).json("Offer deleted succesfully !");
  } catch (error) {
    console.log(error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
