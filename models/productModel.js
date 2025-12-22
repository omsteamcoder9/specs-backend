// models/Product.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const productSchema = new mongoose.Schema({
    // ✅ Auto Increment Serial No
    sNo: {
        type: Number,
        unique: true,
        index: true
    },

    // ✅ Basic Info
    name: {
        type: String,
        required: [true, 'Please enter product name'],
        trim: true
    },
    slug: {
        type: String,
        unique: true
    },
    price: {
        type: Number,
        required: [true, 'Please enter product price']
    },
    description: {
        type: String,
        required: [true, 'Please enter product description']
    },

    // ✅ Category
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Please select a category']
    },

    // // ✅ Size Variants (SEPARATE)
    // sizes: [
    //     {
    //         size: {
    //             type: String,
    //             enum: ['M', 'L', 'XL', 'XXL'],
    //             required: true
    //         },
    //         stock: {
    //             type: Number,
    //             default: 0
    //         }
    //     }
    // ],

    // ✅ Color Variants (SEPARATE)
    colors: [
        {
            name: {
                type: String,
                required: true
            },
            code: {
                type: String // hex: #FFFFFF
            },
            stock: {
                type: Number,
                default: 0
            }
        }
    ],

    // ✅ Specifications
    specifications: [
        {
            key: {
                type: String,
                required: true
            },
            value: {
                type: String,
                required: true
            }
        }
    ],

    // ✅ Ratings & Reviews
    rating: {
        type: Number,
        default: 0
    },
    numberOfReviews: {
        type: Number,
        default: 0
    },

    // ✅ Images
    images: [
        {
            image: {
                type: String,
                required: true
            }
        }
    ],

    // ✅ Seller Info
    seller: {
        type: String,
        required: [true, 'Please enter seller name']
    },

    // ✅ Total Stock (optional fallback)
    stock: {
        type: Number,
        required: [true, 'Please enter stock quantity']
    },

    // ✅ SEO Fields
    metaTitle: { type: String, maxlength: 60 },
    metaDescription: { type: String, maxlength: 160 },
    metaKeywords: { type: [String] },
    canonicalUrl: { type: String },
    ogTitle: { type: String },
    ogDescription: { type: String },
    ogImage: { type: String },

    // ✅ Product Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'out-of-stock'],
        default: 'active'
    },

    // ✅ Featured Product
    featured: {
        type: Boolean,
        default: false
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});


// ✅ Generate slug
productSchema.pre('save', function (next) {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, { lower: true, strict: true });
    }
    next();
});


// ✅ Auto Increment S.No
productSchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            const lastProduct = await this.constructor
                .findOne({}, {}, { sort: { sNo: -1 } });
            this.sNo = lastProduct ? lastProduct.sNo + 1 : 1;
        } catch (err) {
            this.sNo = Date.now();
        }
    }
    next();
});


// ✅ Indexes
productSchema.index({ category: 1, status: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ slug: 1 });

export default mongoose.model('Product', productSchema);
